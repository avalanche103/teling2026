import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { setRequestHandled } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;

  let body: { handled?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (typeof body.handled !== "boolean") {
    return NextResponse.json(
      { error: "Укажите handled: true|false" },
      { status: 400 }
    );
  }

  const { id } = await params;
  const item = setRequestHandled(id, body.handled);
  if (!item) {
    return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
  }

  return NextResponse.json(item);
}
