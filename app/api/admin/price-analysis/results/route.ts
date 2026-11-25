import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getSchedulerPublicStatus } from "@/lib/price-analysis/scheduler";
import { isXmlRiverConfigured } from "@/lib/price-analysis/serp-xmlriver";
import { readCache, readWatchlist } from "@/lib/price-analysis/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const cache = readCache();
  const watchlist = readWatchlist();
  const byId = new Map(watchlist.items.map((i) => [i.id, i]));

  // Prefer live snapshot from watchlist (price/cost) over stale scan cache fields
  const results = cache.results.map((row) => {
    const snap = byId.get(row.productId);
    if (!snap) return row;
    return {
      ...row,
      ourPrice: snap.price,
      costPrice: snap.costPrice ?? row.costPrice,
      sku: snap.sku || row.sku,
      name: snap.name || row.name,
      supplier: snap.supplier || row.supplier,
    };
  });

  return NextResponse.json({
    configured: isXmlRiverConfigured(),
    watchlistUpdatedAt: watchlist.updatedAt,
    watchlistCount: watchlist.items.length || watchlist.productIds.length,
    updatedAt: cache.updatedAt,
    results,
    scheduler: getSchedulerPublicStatus(),
  });
}
