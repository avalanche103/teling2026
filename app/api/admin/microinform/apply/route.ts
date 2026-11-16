import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches, invalidateSectionCaches } from "@/lib/data";
import { readCachedPriceBook } from "@/lib/microinform/price-cache";
import type { MicroinformSettings, SectionMap } from "@/lib/microinform/store";
import { applyPriceBook } from "@/lib/microinform/sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const book = readCachedPriceBook();
  if (!book) {
    return NextResponse.json(
      { error: "Прайс ещё не загружен. Нажмите «Обновить прайс»." },
      { status: 404 },
    );
  }

  try {
    const body = (await request.json()) as {
      sectionMap: SectionMap;
      settings?: Partial<MicroinformSettings>;
    };
    if (!body.sectionMap || typeof body.sectionMap !== "object") {
      return NextResponse.json({ error: "Нужна карта разделов sectionMap" }, { status: 400 });
    }

    const result = applyPriceBook(book, body.sectionMap, body.settings);
    invalidateProductCaches();
    invalidateSectionCaches();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось применить прайс",
      },
      { status: 500 },
    );
  }
}
