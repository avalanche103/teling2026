import { NextRequest, NextResponse } from "next/server";
import { blockChat, getChatById } from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";

// POST /api/admin/chats/[id]/block  — toggle block for a visitor
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = await req.json();
  const { blocked } = body as { blocked?: boolean };

  if (typeof blocked !== "boolean") {
    return NextResponse.json({ error: "blocked (boolean) is required" }, { status: 400 });
  }

  const existing = getChatById(id);
  if (!existing) {
    return NextResponse.json({ error: "chat not found" }, { status: 404 });
  }

  const chat = blockChat(id, blocked);
  return NextResponse.json({ blocked: chat!.blocked });
}
