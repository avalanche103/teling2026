import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import {
  diffExfoAgainstStore,
  fetchExfoCatalog,
  seedExfoCatalogFromSsd,
} from "@/lib/concept/exfo-catalog";
import { analyzeFromCaches } from "@/lib/concept/sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    let scrapeRemote = true;
    try {
      const body = (await request.json()) as { scrapeRemote?: boolean };
      if (body.scrapeRemote === false) scrapeRemote = false;
    } catch {
      /* empty body ok */
    }

    const cache = scrapeRemote
      ? await fetchExfoCatalog({
          includeSsdSeed: true,
          scrapeExforus: true,
          scrapeCtt: true,
          scrapeAlfa: true,
        })
      : seedExfoCatalogFromSsd();

    const diff = diffExfoAgainstStore(cache.items);
    const analysis = analyzeFromCaches();
    return NextResponse.json({
      ok: true,
      fetchedAt: cache.fetchedAt,
      productCount: cache.items.length,
      sources: cache.sources,
      warnings: cache.warnings || [],
      addedSincePrevious: cache.addedSincePrevious ?? 0,
      updatedSincePrevious: cache.updatedSincePrevious ?? 0,
      inStore: diff.inStore,
      willCreate: diff.willCreate,
      willUpdate: diff.willUpdate,
      analysis,
    });
  } catch (error) {
    const fallback = seedExfoCatalogFromSsd();
    const diff = diffExfoAgainstStore(fallback.items);
    return NextResponse.json({
      ok: true,
      fetchedAt: fallback.fetchedAt,
      productCount: fallback.items.length,
      sources: fallback.sources,
      warnings: [
        error instanceof Error
          ? `Удалённый каталог недоступен (${error.message}), использован локальный seed`
          : "Удалённый каталог недоступен, использован локальный seed",
        ...(fallback.warnings || []),
      ],
      addedSincePrevious: 0,
      updatedSincePrevious: 0,
      inStore: diff.inStore,
      willCreate: diff.willCreate,
      willUpdate: diff.willUpdate,
      analysis: analyzeFromCaches(),
    });
  }
}
