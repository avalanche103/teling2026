import { NextRequest, NextResponse } from "next/server";
import { authenticateEmployee, createSessionResponse } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };

  if (!body.username?.trim() || !body.password?.trim()) {
    return NextResponse.json({ error: "Логин и пароль обязательны" }, { status: 400 });
  }

  const user = authenticateEmployee(body.username, body.password);
  if (!user) {
    return NextResponse.json({ error: "Неверный логин или пароль" }, { status: 401 });
  }

  return createSessionResponse(user);
}