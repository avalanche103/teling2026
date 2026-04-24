import { NextResponse } from "next/server";
import { getChats } from "@/lib/chats";

// GET /api/admin/chats — list all conversations
export async function GET() {
  const chats = getChats();
  // Return sorted newest-first
  const sorted = [...chats].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  return NextResponse.json(sorted);
}
