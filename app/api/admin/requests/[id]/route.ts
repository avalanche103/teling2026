import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getRequestById } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const item = getRequestById(id);
  if (!item) {
    return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
  }

  return NextResponse.json(item);
}
