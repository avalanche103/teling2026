/** Public Onliner catalog search — min offer price without scraping HTML. */

const SEARCH_URL = "https://www.onliner.by/sdapi/catalog.api/search/products";
const FETCH_TIMEOUT_MS = 12_000;

export interface OnlinerMatch {
  minPrice: number;
  url: string;
  key: string;
  matchedName: string;
  offers: number;
}

interface OnlinerPriceAmount {
  amount?: string;
  currency?: string;
}

interface OnlinerSearchProduct {
  id?: number;
  key?: string;
  name?: string;
  full_name?: string;
  html_url?: string;
  manufacturer?: { name?: string; key?: string };
  prices?: {
    price_min?: OnlinerPriceAmount;
    price_max?: OnlinerPriceAmount;
    offers?: { count?: number };
    html_url?: string;
  };
}

interface OnlinerSearchResponse {
  products?: OnlinerSearchProduct[];
  total?: number;
}

export function normalizeArticul(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/**
 * Exact model or HW revision (`DES-1008P`, `DES-1008P/C1A`).
 * Rejects elongated models (`DGS-1250-52X` vs `DGS-1250-52XMP`).
 */
export function matchesArticul(productName: string, articul: string): boolean {
  const name = normalizeArticul(productName);
  const art = normalizeArticul(articul);
  if (!name || !art) return false;
  if (name === art) return true;
  if (name.startsWith(`${art}/`)) return true;
  return false;
}

function parseAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(String(raw).replace(",", ".").trim());
  if (!Number.isFinite(value) || value <= 0) return null;
  return Number(value.toFixed(2));
}

function brandMatches(
  product: OnlinerSearchProduct,
  brand: string,
): boolean {
  const want = brand.trim().toLowerCase();
  if (!want) return true;
  const got = (product.manufacturer?.name || "").trim().toLowerCase();
  if (!got) return true;
  return got === want || got.includes(want) || want.includes(got);
}

export async function searchOnlinerProducts(
  query: string,
): Promise<OnlinerSearchProduct[]> {
  const q = query.trim();
  if (!q) return [];

  const url = `${SEARCH_URL}?query=${encodeURIComponent(q)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "User-Agent": "TelingPriceAnalysis/1.0 (+https://teling.by)",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Onliner HTTP ${res.status}`);
    }
    const json = (await res.json()) as OnlinerSearchResponse;
    return Array.isArray(json.products) ? json.products : [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Find lowest Onliner catalog price for brand+articul (including HW revisions).
 */
export async function fetchOnlinerMinPrice(input: {
  brand?: string;
  articul?: string;
  fallbackQuery?: string;
}): Promise<{ match: OnlinerMatch | null; error: string | null }> {
  const brand = (input.brand || "").trim();
  const articul = (input.articul || "").trim();
  const query =
    [brand, articul].filter(Boolean).join(" ").trim() ||
    (input.fallbackQuery || "").trim();

  if (!articul && !query) {
    return { match: null, error: null };
  }

  try {
    const products = await searchOnlinerProducts(query || articul);
    const art = articul || query;
    const candidates = products.filter(
      (p) => matchesArticul(p.name || "", art) && brandMatches(p, brand),
    );

    let best: OnlinerMatch | null = null;
    for (const p of candidates) {
      const minPrice = parseAmount(p.prices?.price_min?.amount);
      if (minPrice == null) continue;
      const offers =
        typeof p.prices?.offers?.count === "number" ? p.prices.offers.count : 0;
      const url =
        (typeof p.html_url === "string" && p.html_url) ||
        (typeof p.prices?.html_url === "string" && p.prices.html_url) ||
        (p.key ? `https://catalog.onliner.by/products/${p.key}` : "");
      const candidate: OnlinerMatch = {
        minPrice,
        url,
        key: typeof p.key === "string" ? p.key : "",
        matchedName: (p.full_name || p.name || "").trim(),
        offers,
      };
      if (!best || candidate.minPrice < best.minPrice) {
        best = candidate;
      }
    }

    return { match: best, error: null };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "AbortError"
          ? "Onliner: timeout"
          : err.message
        : String(err);
    return { match: null, error: message };
  }
}
