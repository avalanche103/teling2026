import { NextResponse } from "next/server";
import { listChatOperators, requireApiSession } from "@/lib/auth";

// GET /api/admin/chat-operators — active staff for transfer select
export async function GET() {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(listChatOperators());
}
