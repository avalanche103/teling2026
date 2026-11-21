import { NextResponse } from "next/server";
import { deleteChat, getChatById } from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";

// DELETE /api/admin/chats/[id] — admin removes a conversation
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const existing = getChatById(id);
  if (!existing) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }

  deleteChat(id);
  return NextResponse.json({ ok: true, id });
}
