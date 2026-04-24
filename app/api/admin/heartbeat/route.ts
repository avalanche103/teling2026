import { NextResponse } from "next/server";
import { updateHeartbeat, isOperatorOnline } from "@/lib/operator-status";
import { requireApiSession } from "@/lib/auth";

// POST /api/admin/heartbeat — admin panel pings to mark itself online
export async function POST() {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  updateHeartbeat();
  return NextResponse.json({ ok: true });
}

// GET /api/admin/heartbeat — check current status (optional, for debugging)
export async function GET() {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ online: isOperatorOnline() });
}
