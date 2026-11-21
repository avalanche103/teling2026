import { NextRequest, NextResponse } from "next/server";
import { deleteChats } from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";

// POST /api/admin/chats/delete — admin bulk delete { ids: string[] }
export async function POST(req: NextRequest) {
  const auth = await requireApiSession(["admin"]);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids)
    ? body.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }

  const removed = deleteChats(ids);
  return NextResponse.json({ ok: true, removed });
}
