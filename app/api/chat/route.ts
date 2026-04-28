import { NextRequest, NextResponse } from "next/server";
import {
  createChat,
  appendMessage,
  getChatByVisitorId,
  getChatById,
  updateVisitorInfo,
} from "@/lib/chats";
import type { ContactField } from "@/lib/chats";
import type { VisitorInfo } from "@/lib/chats";
import { isOperatorOnline } from "@/lib/operator-status";
import { sendMissedChatNotification } from "@/lib/email";
import { processInactiveChatsEmail } from "@/lib/chat-inactivity";

// POST /api/chat  — visitor sends a message
export async function POST(req: NextRequest) {
  await processInactiveChatsEmail();
  const body = await req.json();
  const { visitorId, chatId, text, type, field, visitorInfo } = body as {
    visitorId?: string;
    chatId?: string;
    text?: string;
    type?: string;
    field?: ContactField;
    visitorInfo?: Partial<VisitorInfo>;
  };

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }
  if (!visitorId || typeof visitorId !== "string") {
    return NextResponse.json({ error: "visitorId is required" }, { status: 400 });
  }

  const msgType = type === "contact_response" ? "contact_response" : "text";

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    undefined;
  const userAgent = req.headers.get("user-agent") ?? undefined;
  const mergedVisitorInfo: Partial<VisitorInfo> = {
    ...visitorInfo,
    ip: ip ?? visitorInfo?.ip,
    userAgent: userAgent ?? visitorInfo?.userAgent,
  };

  let chat;
  if (chatId) {
    const existingById = getChatById(chatId);
    if (!existingById) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
    if (existingById.blocked) {
      return NextResponse.json({ error: "blocked" }, { status: 403 });
    }
    updateVisitorInfo(chatId, mergedVisitorInfo);
    chat = appendMessage(chatId, "visitor", text.trim(), msgType, field);
    if (msgType === "contact_response" && field) {
      updateVisitorInfo(chatId, { [field]: text.trim() });
    }
  } else {
    const existingByVisitor = getChatByVisitorId(visitorId);
    if (existingByVisitor) {
      if (existingByVisitor.blocked) {
        return NextResponse.json({ error: "blocked" }, { status: 403 });
      }
      updateVisitorInfo(existingByVisitor.id, mergedVisitorInfo);
      chat = appendMessage(existingByVisitor.id, "visitor", text.trim(), msgType, field);
      if (msgType === "contact_response" && field) {
        updateVisitorInfo(existingByVisitor.id, { [field]: text.trim() });
      }
    } else {
      chat = createChat(visitorId, text.trim(), mergedVisitorInfo);
      // Notify by email if operator is offline (missed chat)
      if (!isOperatorOnline()) {
        sendMissedChatNotification(chat).catch((err) => {
          console.error("[email] Ошибка отправки уведомления о пропущенном чате:", err);
        });
      }
    }
  }

  return NextResponse.json({ chatId: chat!.id, messages: chat!.messages });
}

// GET /api/chat?chatId=... — visitor polls messages
export async function GET(req: NextRequest) {
  await processInactiveChatsEmail();
  const chatId = req.nextUrl.searchParams.get("chatId");
  if (!chatId) {
    return NextResponse.json({ error: "chatId required" }, { status: 400 });
  }
  const chat = getChatById(chatId);
  if (!chat) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ messages: chat.messages, blocked: chat.blocked });
}
