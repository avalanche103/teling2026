import { NextResponse } from "next/server";
import { claimChat } from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";

// POST /api/admin/chats/[id]/claim — take from queue
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const result = claimChat(id, {
    id: auth.session.user.id,
    name: auth.session.user.name,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.chat);
}
