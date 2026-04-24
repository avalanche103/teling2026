import { NextRequest, NextResponse } from "next/server";
import { createEmployee, listEmployees, requireApiSession } from "@/lib/auth";

export async function GET() {
  const auth = await requireApiSession(["admin"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(listEmployees());
}

export async function POST(req: NextRequest) {
  const auth = await requireApiSession(["admin"]);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    name?: string;
    role?: "admin" | "employee" | "operator";
    password?: string;
  };

  try {
    const employee = createEmployee({
      username: body.username ?? "",
      name: body.name ?? "",
      role: body.role === "admin" || body.role === "employee" || body.role === "operator" ? body.role : "operator",
      password: body.password ?? "",
    });
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось создать сотрудника" },
      { status: 400 }
    );
  }
}