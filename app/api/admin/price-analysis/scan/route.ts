import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { watchlistItemToProductRaw } from "@/lib/price-analysis/lookup";
import { scanProducts } from "@/lib/price-analysis/scan";
import { isXmlRiverConfigured } from "@/lib/price-analysis/serp-xmlriver";
import {
  mergeCacheResults,
  readCache,
  readWatchlist,
  writeCache,
} from "@/lib/price-analysis/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  if (!isXmlRiverConfigured()) {
    return NextResponse.json(
      { error: "XMLRiver не настроен: задайте XMLRIVER_USER и XMLRIVER_KEY" },
      { status: 503 },
    );
  }

  let body: { productIds?: unknown } = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as { productIds?: unknown };
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  const watchlist = readWatchlist();
  if (!watchlist.items.length) {
    return NextResponse.json(
      {
        error:
          "Список пуст или без снимков товаров — добавьте позиции заново (себестоимость подтянется при добавлении)",
      },
      { status: 400 },
    );
  }

  const requested = Array.isArray(body.productIds)
    ? body.productIds
        .map((id) => (typeof id === "number" ? id : Number(id)))
        .filter((id) => Number.isFinite(id))
        .map((id) => Math.trunc(id))
    : null;

  const idSet = requested?.length ? new Set(requested) : null;
  const items = idSet
    ? watchlist.items.filter((i) => idSet.has(i.id))
    : watchlist.items;

  if (items.length === 0) {
    return NextResponse.json({ error: "Товары не найдены в списке" }, { status: 404 });
  }

  if (items.length > 100) {
    return NextResponse.json(
      { error: "За один скан максимум 100 товаров" },
      { status: 400 },
    );
  }

  const toScan = items.map(watchlistItemToProductRaw);
  const scanned = await scanProducts(toScan, 2);
  const nextCache = mergeCacheResults(readCache(), scanned);
  writeCache(nextCache);

  return NextResponse.json({
    scanned: scanned.length,
    updatedAt: nextCache.updatedAt,
    results: scanned,
  });
}
