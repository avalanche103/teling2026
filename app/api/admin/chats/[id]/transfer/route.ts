import { NextRequest, NextResponse } from "next/server";
import { transferChat } from "@/lib/chats";
import { getEmployeeById, requireApiSession } from "@/lib/auth";

// POST /api/admin/chats/[id]/transfer — { toEmployeeId }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { toEmployeeId?: string };

  if (!body.toEmployeeId?.trim()) {
    return NextResponse.json({ error: "toEmployeeId is required" }, { status: 400 });
  }

  const target = getEmployeeById(body.toEmployeeId.trim());
  if (!target || !target.active) {
    return NextResponse.json({ error: "Сотрудник не найден" }, { status: 404 });
  }

  const result = transferChat(
    id,
    {
      id: auth.session.user.id,
      name: auth.session.user.name,
      role: auth.session.user.role,
    },
    { id: target.id, name: target.name }
  );
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.chat);
}
