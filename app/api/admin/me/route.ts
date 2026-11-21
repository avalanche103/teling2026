import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";

// GET /api/admin/me — current staff session (for chat UI)
export async function GET() {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    id: auth.session.user.id,
    username: auth.session.user.username,
    name: auth.session.user.name,
    role: auth.session.user.role,
  });
}
