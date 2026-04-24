import { NextResponse } from "next/server";
import { isOperatorOnline } from "@/lib/operator-status";

// GET /api/chat/operator-status — visitor checks if operator is online
export async function GET() {
  return NextResponse.json({ online: isOperatorOnline() });
}
