import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches, invalidateSectionCaches } from "@/lib/data";
import { readExfoCatalogCache } from "@/lib/concept/exfo-catalog";
import { readCachedKiwiPriceBook } from "@/lib/concept/price-cache";
import { applyConceptCatalog } from "@/lib/concept/sync";
import type { ConceptSettings, SectionMap } from "@/lib/concept/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      sectionMap: SectionMap;
      settings?: Partial<ConceptSettings>;
    };
    if (!body.sectionMap || typeof body.sectionMap !== "object") {
      return NextResponse.json({ error: "Нужна карта разделов sectionMap" }, { status: 400 });
    }

    const kiwiBook = readCachedKiwiPriceBook();
    const exfoItems = readExfoCatalogCache()?.items || [];
    if (!kiwiBook && exfoItems.length === 0) {
      return NextResponse.json(
        { error: "Нет данных: загрузите прайс KIWI и/или обновите EXFO." },
        { status: 400 },
      );
    }

    const result = applyConceptCatalog({
      kiwiBook,
      exfoItems,
      sectionMapInput: body.sectionMap,
      settingsPatch: body.settings,
    });
    invalidateProductCaches();
    invalidateSectionCaches();

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось применить каталог",
      },
      { status: 500 },
    );
  }
}
