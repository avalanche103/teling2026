export type SerpEngine = "yandex" | "google";

export interface SerpHit {
  engine: SerpEngine;
  title: string;
  url: string;
  snippet: string;
  prices: number[];
}

export interface PriceAnalysisProductResult {
  productId: number;
  sku: string;
  name: string;
  supplier: string | null;
  ourPrice: number;
  costPrice: number | null;
  query: string;
  scannedAt: string;
  hits: SerpHit[];
  validPrices: number[];
  /** Min of filtered SERP snippet prices (secondary signal). */
  serpMinPrice: number | null;
  onlinerMinPrice: number | null;
  onlinerUrl: string | null;
  onlinerMatchedName: string | null;
  onlinerOffers: number | null;
  /** Prefer Onliner min; fall back to SERP min. */
  suggestedPrice: number | null;
  error: string | null;
}

export interface PriceAnalysisCache {
  updatedAt: string | null;
  results: PriceAnalysisProductResult[];
}

/** Snapshot stored in watchlist — avoids loading full products.json on page open. */
export interface PriceAnalysisWatchlistItem {
  id: number;
  sku: string;
  name: string;
  supplier: string | null;
  price: number;
  priceWithoutVat: number;
  costPrice: number | null;
  brand: string;
  sectionName: string;
  articul?: string;
}

export interface PriceAnalysisWatchlist {
  productIds: number[];
  items: PriceAnalysisWatchlistItem[];
  updatedAt: string | null;
}

export type PriceAnalysisSchedulerStatus = "idle" | "running" | "done";

export interface PriceAnalysisSchedulerState {
  weekKey: string;
  status: PriceAnalysisSchedulerStatus;
  cursor: number;
  total: number;
  lastBatchAt: string | null;
  lastError: string | null;
  lastScannedIds: number[];
}
