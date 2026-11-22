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
