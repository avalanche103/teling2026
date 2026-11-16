import { getProductSummaryBySku } from "@/lib/data";
import type { RequestItem } from "@/lib/requests";

const MAX_ITEMS = 100;

export interface IncomingCartItem {
  sku?: unknown;
  qty?: unknown;
}

/** Resolve client cart lines into catalog-backed request items. */
export function resolveRequestItems(rawItems: IncomingCartItem[]): RequestItem[] {
  const qtyBySku = new Map<string, number>();
  for (const raw of rawItems.slice(0, MAX_ITEMS)) {
    const sku = String(raw.sku ?? "").trim();
    const qty = Math.floor(Number(raw.qty));
    if (!sku || !Number.isFinite(qty) || qty < 1) continue;
    qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + qty);
  }

  const items: RequestItem[] = [];
  for (const [sku, qty] of qtyBySku) {
    const product = getProductSummaryBySku(sku);
    if (!product || !product.visible) continue;
    items.push({
      sku: product.sku,
      name: product.name,
      qty,
      price: product.price,
      currency: product.currency || product.currencyCode || "BYN",
    });
  }
  return items;
}
