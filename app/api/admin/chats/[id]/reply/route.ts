import { NextRequest, NextResponse } from "next/server";
import { appendMessage, getChatById } from "@/lib/chats";
import type { ContactField } from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";

// POST /api/admin/chats/[id]/reply — support sends a reply
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json();
  const { text, type, field } = body as {
    text?: string;
    type?: string;
    field?: ContactField;
  };

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const existing = getChatById(id);
  if (!existing) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }

  const msgType =
    type === "contact_request" ? "contact_request" : "text";
  const chat = appendMessage(id, "support", text.trim(), msgType, field);
  return NextResponse.json({ messages: chat!.messages });
}
