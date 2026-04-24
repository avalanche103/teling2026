import { NextResponse } from "next/server";
import { updateHeartbeat, isOperatorOnline } from "@/lib/operator-status";

// POST /api/admin/heartbeat — admin panel pings to mark itself online
export async function POST() {
  updateHeartbeat();
  return NextResponse.json({ ok: true });
}

// GET /api/admin/heartbeat — check current status (optional, for debugging)
export async function GET() {
  return NextResponse.json({ online: isOperatorOnline() });
}
