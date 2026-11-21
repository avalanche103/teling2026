import { NextRequest, NextResponse } from "next/server";
import {
  filterChatsForUser,
  getChats,
  type ChatListScope,
} from "@/lib/chats";
import { requireApiSession } from "@/lib/auth";
import { processInactiveChatsEmail } from "@/lib/chat-inactivity";

// GET /api/admin/chats?scope=all|mine|queue
export async function GET(req: NextRequest) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  await processInactiveChatsEmail();

  const rawScope = req.nextUrl.searchParams.get("scope") ?? "default";
  const scope: ChatListScope =
    rawScope === "all" || rawScope === "mine" || rawScope === "queue"
      ? rawScope
      : "default";

  const chats = filterChatsForUser(
    getChats(),
    auth.session.user.id,
    auth.session.user.role,
    scope
  );
  const sorted = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return NextResponse.json(sorted);
}
