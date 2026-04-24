import { NextRequest, NextResponse } from "next/server";
import { requireApiSession, updateEmployee } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    name?: string;
    role?: "admin" | "employee" | "operator";
    password?: string;
    active?: boolean;
  };

  try {
    const employee = updateEmployee(id, {
      username: body.username,
      name: body.name,
      role: body.role,
      password: body.password,
      active: body.active,
    });
    return NextResponse.json(employee);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Не удалось обновить сотрудника" },
      { status: 400 }
    );
  }
}