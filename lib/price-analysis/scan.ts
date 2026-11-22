import type { ProductRaw } from "@/lib/types";
import {
  filterValidPrices,
  suggestMinPrice,
} from "./extract-prices";
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

export async function scanProduct(
  product: ProductRaw,
): Promise<PriceAnalysisProductResult> {
  const name = productName(product);
  const query = buildSearchQuery(product);
  const costRaw = product.metadata?.cost_price;
  const costPrice =
    typeof costRaw === "number" && Number.isFinite(costRaw) && costRaw > 0
      ? costRaw
      : null;

  const base: Omit<PriceAnalysisProductResult, "hits" | "validPrices" | "suggestedPrice" | "error" | "scannedAt"> & {
    scannedAt: string;
  } = {
    productId: product.id,
    sku: product.sku || "",
    name,
    supplier: product.supplier || null,
    ourPrice: product.price,
    costPrice,
    query,
    scannedAt: new Date().toISOString(),
  };

  if (!isXmlRiverConfigured()) {
    return {
      ...base,
      hits: [],
      validPrices: [],
      suggestedPrice: null,
      error: "XMLRiver не настроен (XMLRIVER_USER / XMLRIVER_KEY)",
    };
  }

  try {
    const { hits: rawHits, errors } = await searchBothEngines(query);
    const hits = dedupeHits(rawHits);
    const allPrices = hits.flatMap((h) => h.prices);
    const validPrices = filterValidPrices(allPrices, product.price);
    const suggestedPrice = suggestMinPrice(validPrices);
    return {
      ...base,
      hits,
      validPrices,
      suggestedPrice,
      error: errors.length ? errors.join("; ") : null,
    };
  } catch (err) {
    return {
      ...base,
      hits: [],
      validPrices: [],
      suggestedPrice: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Sequential with small concurrency to avoid burning XMLRiver / rate limits. */
export async function scanProducts(
  products: ProductRaw[],
  concurrency = 2,
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

  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, products.length)) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}
