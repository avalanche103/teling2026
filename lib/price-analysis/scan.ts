import type { ProductRaw } from "@/lib/types";
import {
  filterValidPrices,
  suggestMinPrice,
} from "./extract-prices";
import { fetchOnlinerMinPrice } from "./onliner";
import { isXmlRiverConfigured, searchBothEngines } from "./serp-xmlriver";
import type { PriceAnalysisProductResult, SerpHit } from "./types";

function productName(product: ProductRaw): string {
  if (typeof product.custom_name === "string" && product.custom_name.trim()) {
    return product.custom_name.trim();
  }
  if (typeof product.name === "string" && product.name.trim()) return product.name.trim();
  return product.original_name || product.sku || `ID ${product.id}`;
}

export function buildSearchQuery(product: ProductRaw): string {
  const brand = (product.metadata?.brand || product.vendor || "").trim();
  const articul = (product.metadata?.articul || "").trim();
  const name = productName(product);
  const parts = [brand, articul || name].filter(Boolean);
  // Prefer articul+brand; fall back to name
  const query = parts.join(" ").trim() || name || product.sku;
  return query.slice(0, 200);
}

function dedupeHits(hits: SerpHit[]): SerpHit[] {
  const seen = new Set<string>();
  const out: SerpHit[] = [];
  for (const hit of hits) {
    const key = `${hit.engine}|${hit.url || hit.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}

function emptyOnlinerFields() {
  return {
    serpMinPrice: null as number | null,
    onlinerMinPrice: null as number | null,
    onlinerUrl: null as string | null,
    onlinerMatchedName: null as string | null,
    onlinerOffers: null as number | null,
  };
}

export async function scanProduct(
  product: ProductRaw,
): Promise<PriceAnalysisProductResult> {
  const name = productName(product);
  const query = buildSearchQuery(product);
  const brand = (product.metadata?.brand || product.vendor || "").trim();
  const articul = (product.metadata?.articul || "").trim();
  const costRaw = product.metadata?.cost_price;
  const costPrice =
    typeof costRaw === "number" && Number.isFinite(costRaw) && costRaw > 0
      ? costRaw
      : null;

  const base: Omit<
    PriceAnalysisProductResult,
    | "hits"
    | "validPrices"
    | "serpMinPrice"
    | "onlinerMinPrice"
    | "onlinerUrl"
    | "onlinerMatchedName"
    | "onlinerOffers"
    | "suggestedPrice"
    | "error"
    | "scannedAt"
  > & { scannedAt: string } = {
    productId: product.id,
    sku: product.sku || "",
    name,
    supplier: product.supplier || null,
    ourPrice: product.price,
    costPrice,
    query,
    scannedAt: new Date().toISOString(),
  };

  const onlinerPromise = fetchOnlinerMinPrice({
    brand,
    articul: articul || undefined,
    fallbackQuery: query,
  });

  if (!isXmlRiverConfigured()) {
    const { match, error: onlinerError } = await onlinerPromise;
    const onlinerMinPrice = match?.minPrice ?? null;
    return {
      ...base,
      hits: [],
      validPrices: [],
      ...emptyOnlinerFields(),
      serpMinPrice: null,
      onlinerMinPrice,
      onlinerUrl: match?.url || null,
      onlinerMatchedName: match?.matchedName || null,
      onlinerOffers: match ? match.offers : null,
      suggestedPrice: onlinerMinPrice,
      error: [
        "XMLRiver не настроен (XMLRIVER_USER / XMLRIVER_KEY)",
        onlinerError,
      ]
        .filter(Boolean)
        .join("; ") || null,
    };
  }

  try {
    const [serp, onliner] = await Promise.all([
      searchBothEngines(query),
      onlinerPromise,
    ]);

    const hits = dedupeHits(serp.hits);
    const allPrices = hits.flatMap((h) => h.prices);
    const validPrices = filterValidPrices(allPrices, product.price);
    const serpMinPrice = suggestMinPrice(validPrices);
    const onlinerMinPrice = onliner.match?.minPrice ?? null;
    const suggestedPrice = onlinerMinPrice ?? serpMinPrice;

    const errors = [
      ...serp.errors,
      onliner.error ? `Onliner: ${onliner.error}` : null,
    ].filter(Boolean) as string[];

    return {
      ...base,
      hits,
      validPrices,
      serpMinPrice,
      onlinerMinPrice,
      onlinerUrl: onliner.match?.url || null,
      onlinerMatchedName: onliner.match?.matchedName || null,
      onlinerOffers: onliner.match ? onliner.match.offers : null,
      suggestedPrice,
      error: errors.length ? errors.join("; ") : null,
    };
  } catch (err) {
    const { match, error: onlinerError } = await onlinerPromise.catch(() => ({
      match: null,
      error: null as string | null,
    }));
    const onlinerMinPrice = match?.minPrice ?? null;
    return {
      ...base,
      hits: [],
      validPrices: [],
      serpMinPrice: null,
      onlinerMinPrice,
      onlinerUrl: match?.url || null,
      onlinerMatchedName: match?.matchedName || null,
      onlinerOffers: match ? match.offers : null,
      suggestedPrice: onlinerMinPrice,
      error: [
        err instanceof Error ? err.message : String(err),
        onlinerError ? `Onliner: ${onlinerError}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    };
  }
}

/** Low concurrency — XMLRiver Google often returns 111 when channels are busy. */
export async function scanProducts(
  products: ProductRaw[],
  concurrency = 1,
): Promise<PriceAnalysisProductResult[]> {
  const results: PriceAnalysisProductResult[] = [];
  let index = 0;

  async function worker() {
    while (index < products.length) {
      const i = index++;
      const product = products[i];
      results[i] = await scanProduct(product);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, Math.max(1, products.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
