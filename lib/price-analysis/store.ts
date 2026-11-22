import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type {
  PriceAnalysisCache,
  PriceAnalysisWatchlist,
  PriceAnalysisWatchlistItem,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const WATCHLIST_PATH = path.join(DATA_DIR, "price-analysis-watchlist.json");
const CACHE_PATH = path.join(DATA_DIR, "price-analysis-cache.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function emptyWatchlist(): PriceAnalysisWatchlist {
  return { productIds: [], items: [], updatedAt: null };
}

function emptyCache(): PriceAnalysisCache {
  return { updatedAt: null, results: [] };
}

function normalizeItem(raw: unknown): PriceAnalysisWatchlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Partial<PriceAnalysisWatchlistItem>;
  const id = typeof o.id === "number" ? o.id : Number(o.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const price = typeof o.price === "number" && Number.isFinite(o.price) ? o.price : 0;
  const priceWithoutVat =
    typeof o.priceWithoutVat === "number" && Number.isFinite(o.priceWithoutVat)
      ? o.priceWithoutVat
      : price;
  const cost =
    typeof o.costPrice === "number" && Number.isFinite(o.costPrice) && o.costPrice > 0
      ? o.costPrice
      : null;
  return {
    id: Math.trunc(id),
    sku: typeof o.sku === "string" ? o.sku : "",
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : `ID ${id}`,
    supplier: typeof o.supplier === "string" ? o.supplier : null,
    price,
    priceWithoutVat,
    costPrice: cost,
    brand: typeof o.brand === "string" ? o.brand : "",
    sectionName: typeof o.sectionName === "string" ? o.sectionName : "",
    articul: typeof o.articul === "string" ? o.articul : "",
  };
}

export function readWatchlist(): PriceAnalysisWatchlist {
  if (!existsSync(WATCHLIST_PATH)) return emptyWatchlist();
  try {
    const raw = JSON.parse(readFileSync(WATCHLIST_PATH, "utf-8")) as Partial<PriceAnalysisWatchlist>;
    const fromItems = Array.isArray(raw.items)
      ? raw.items.map(normalizeItem).filter((x): x is PriceAnalysisWatchlistItem => Boolean(x))
      : [];

    // Legacy: only productIds — keep ids, items empty until user re-adds (no full catalog load).
    const legacyIds = Array.isArray(raw.productIds)
      ? [...new Set(raw.productIds.filter((id) => Number.isFinite(id)).map(Number))]
      : [];

    const items =
      fromItems.length > 0
        ? dedupeItems(fromItems)
        : [];

    const productIds = items.length
      ? items.map((i) => i.id)
      : legacyIds;

    return {
      productIds,
      items,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
    };
  } catch {
    return emptyWatchlist();
  }
}

function dedupeItems(items: PriceAnalysisWatchlistItem[]): PriceAnalysisWatchlistItem[] {
  const map = new Map<number, PriceAnalysisWatchlistItem>();
  for (const item of items) map.set(item.id, item);
  return [...map.values()];
}

export function writeWatchlistItems(items: PriceAnalysisWatchlistItem[]): PriceAnalysisWatchlist {
  ensureDataDir();
  const unique = dedupeItems(items);
  const next: PriceAnalysisWatchlist = {
    productIds: unique.map((i) => i.id),
    items: unique,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(WATCHLIST_PATH, JSON.stringify(next, null, 2), "utf-8");
  return next;
}

/** @deprecated Prefer writeWatchlistItems — kept for remove-by-ids without re-lookup. */
export function writeWatchlist(productIds: number[]): PriceAnalysisWatchlist {
  const current = readWatchlist();
  const want = new Set(
    productIds.filter((id) => Number.isFinite(id)).map((id) => Math.trunc(id)),
  );
  const items = current.items.filter((i) => want.has(i.id));
  // If legacy ids without items, keep id-only list
  if (items.length === 0 && want.size > 0 && current.items.length === 0) {
    ensureDataDir();
    const next: PriceAnalysisWatchlist = {
      productIds: [...want],
      items: [],
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(WATCHLIST_PATH, JSON.stringify(next, null, 2), "utf-8");
    return next;
  }
  return writeWatchlistItems(items);
}

export function readCache(): PriceAnalysisCache {
  if (!existsSync(CACHE_PATH)) return emptyCache();
  try {
    const raw = JSON.parse(readFileSync(CACHE_PATH, "utf-8")) as Partial<PriceAnalysisCache>;
    return {
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : null,
      results: Array.isArray(raw.results) ? raw.results : [],
    };
  } catch {
    return emptyCache();
  }
}

export function writeCache(cache: PriceAnalysisCache): void {
  ensureDataDir();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

/** Merge scanned results into cache by productId (replace matching, keep others). */
export function mergeCacheResults(
  previous: PriceAnalysisCache,
  scanned: PriceAnalysisCache["results"],
): PriceAnalysisCache {
  const byId = new Map(previous.results.map((r) => [r.productId, r]));
  for (const row of scanned) {
    byId.set(row.productId, row);
  }
  return {
    updatedAt: new Date().toISOString(),
    results: [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "ru")),
  };
}
