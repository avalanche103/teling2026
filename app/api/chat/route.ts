import { NextRequest, NextResponse } from "next/server";
import {
  createChat,
  appendMessage,
  getChatByVisitorId,
  getChatById,
  updateVisitorInfo,
} from "@/lib/chats";
import type { Chat } from "@/lib/chats";
import type { ContactField } from "@/lib/chats";
import type { VisitorInfo } from "@/lib/chats";
import { isOperatorOnline } from "@/lib/operator-status";
import { sendMissedChatNotification } from "@/lib/email";
import { processInactiveChatsEmail } from "@/lib/chat-inactivity";
import { maybeReplyWithChatBot, shouldRunChatBot } from "@/lib/ai/chat-bot";
import { messagesForVisitor } from "@/lib/chat-public";

type MsgType = "text" | "contact_response";

/** Resume existing chat for visitor or create a new one. Returns Response on block. */
function resumeOrCreateByVisitor(
  visitorId: string,
  text: string,
  msgType: MsgType,
  field: ContactField | undefined,
  mergedVisitorInfo: Partial<VisitorInfo>
): Chat | NextResponse {
  const existingByVisitor = getChatByVisitorId(visitorId);
  if (existingByVisitor) {
    if (existingByVisitor.blocked) {
      return NextResponse.json({ error: "blocked" }, { status: 403 });
    }
    updateVisitorInfo(existingByVisitor.id, mergedVisitorInfo);
    const chat = appendMessage(existingByVisitor.id, "visitor", text, msgType, field);
    if (msgType === "contact_response" && field) {
      updateVisitorInfo(existingByVisitor.id, { [field]: text });
    }
    return chat!;
  }

  const chat = createChat(visitorId, text, mergedVisitorInfo);
  if (!isOperatorOnline()) {
    sendMissedChatNotification(chat).catch((err) => {
      console.error("[email] Ошибка отправки уведомления о пропущенном чате:", err);
    });
  }
  return chat;
}

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

  const msgType: MsgType = type === "contact_response" ? "contact_response" : "text";
  const trimmed = text.trim();

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

  let chat: Chat | null = null;

  if (chatId) {
    const existingById = getChatById(chatId);
    if (existingById) {
      if (existingById.blocked) {
        return NextResponse.json({ error: "blocked" }, { status: 403 });
      }
      updateVisitorInfo(chatId, mergedVisitorInfo);
      chat = appendMessage(chatId, "visitor", trimmed, msgType, field);
      if (msgType === "contact_response" && field) {
        updateVisitorInfo(chatId, { [field]: trimmed });
      }
    }
    // Deleted chat: fall through and start/resume a fresh dialog
  }

  if (!chat) {
    const result = resumeOrCreateByVisitor(
      visitorId,
      trimmed,
      msgType,
      field,
      mergedVisitorInfo
    );
    if (result instanceof NextResponse) return result;
    chat = result;
  }

  if (shouldRunChatBot(chat, msgType)) {
    const withBot = await maybeReplyWithChatBot(chat.id);
    if (withBot) chat = withBot;
  }

  return NextResponse.json({
    chatId: chat.id,
    messages: messagesForVisitor(chat.messages),
  });
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
    // Signal widget to clear stale localStorage chat_id (e.g. after admin delete)
    return NextResponse.json({ messages: [], gone: true });
  }
  return NextResponse.json({
    messages: messagesForVisitor(chat.messages),
    blocked: chat.blocked,
  });
}
