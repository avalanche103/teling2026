import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches } from "@/lib/data";
import { publishConceptProducts } from "@/lib/concept/pending";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { ids?: number[]; sectionId?: number };
    const ids = Array.isArray(body.ids) ? body.ids.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) {
      return NextResponse.json({ error: "Нужны ids для публикации" }, { status: 400 });
    }
    const result = publishConceptProducts({
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
