import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches } from "@/lib/data";
import { publishMicroinformProducts } from "@/lib/microinform/pending";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      ids?: number[];
      sectionId?: number;
    };
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: "Укажите ids товаров" }, { status: 400 });
    }

    const result = publishMicroinformProducts({
      ids,
      sectionId: typeof body.sectionId === "number" ? body.sectionId : undefined,
    });
    invalidateProductCaches();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось опубликовать",
      },
      { status: 500 },
    );
  }
}
