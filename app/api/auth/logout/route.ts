import { NextRequest } from "next/server";
import { createLogoutResponse, isSecureRequest } from "@/lib/auth";

export async function POST(req: NextRequest) {
  return createLogoutResponse(isSecureRequest(req));
}