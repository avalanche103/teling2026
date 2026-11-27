import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { analyzeFromCaches } from "@/lib/concept/sync";
import type { SectionMap } from "@/lib/concept/store";
import { readSections } from "@/lib/concept/store";
import { readCachedKiwiPriceBook } from "@/lib/concept/price-cache";
import {
  countConceptExfoProducts,
  diffExfoAgainstStore,
  readExfoCatalogCache,
} from "@/lib/concept/exfo-catalog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const kiwi = readCachedKiwiPriceBook();
  const exfo = readExfoCatalogCache();
  const analysis = analyzeFromCaches();
  const catalogSections = readSections().map((s) => ({
    id: s.id,
    name: s.name,
    parent: s.parent,
    external_id: s.external_id,
    selected_filters: s.metadata?.selected_filters || [],
  }));

  return NextResponse.json({
    kiwi: kiwi
      ? {
          fetchedAt: kiwi.fetchedAt,
          sourceName: kiwi.sourceName,
          productCount: kiwi.products.length,
        }
      : null,
    exfo: exfo
      ? {
          fetchedAt: exfo.fetchedAt,
          productCount: exfo.items.length,
          sources: exfo.sources,
          warnings: exfo.warnings || [],
          addedSincePrevious: exfo.addedSincePrevious ?? 0,
          ...diffExfoAgainstStore(exfo.items),
          conceptCount: countConceptExfoProducts(),
        }
      : null,
    analysis,
    catalogSections,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { sectionMap?: SectionMap };
    const analysis = analyzeFromCaches(body.sectionMap);
    return NextResponse.json({ analysis });
  } catch {
    return NextResponse.json({ error: "Не удалось проанализировать каталог" }, { status: 500 });
  }
}
