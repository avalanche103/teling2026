import type { ProductRaw } from "@/lib/types";
import { readMicroinformProducts } from "@/lib/microinform/store";
import type { PriceAnalysisWatchlistItem } from "./types";

function productName(product: ProductRaw): string {
  if (typeof product.custom_name === "string" && product.custom_name.trim()) {
    return product.custom_name.trim();
  }
  if (typeof product.name === "string" && product.name.trim()) return product.name.trim();
  return product.original_name || product.sku || `ID ${product.id}`;
}

function toWatchlistItem(product: ProductRaw): PriceAnalysisWatchlistItem {
  const cost = product.metadata?.cost_price;
  return {
    id: product.id,
    sku: product.sku || "",
    name: productName(product),
    supplier: product.supplier || (product.id >= 2_000_000 ? "microinform" : null),
    price: product.price,
    priceWithoutVat: product.price_without_vat,
    costPrice:
      typeof cost === "number" && Number.isFinite(cost) && cost > 0 ? cost : null,
    brand: product.metadata?.brand || product.vendor || "",
    sectionName: product.section_name || "",
    articul: product.metadata?.articul || "",
  };
}

/**
 * Resolve a product for the watchlist without parsing the 100MB+ SSD catalog.
 * Microinform (id >= 2e6): read only products.microinform.json (~6MB).
 * SSD: use client hint; cost_price is typically absent.
 */
export function resolveWatchlistItem(
  id: number,
  hint?: {
    sku?: string;
    name?: string;
    price?: number;
    brand?: string;
    sectionName?: string;
  },
): PriceAnalysisWatchlistItem | null {
  if (!Number.isFinite(id) || id <= 0) return null;

  // Prefer Microinform file for MI ids (and also try it for any id in case of overlap).
  try {
    const mi = readMicroinformProducts();
    const found = mi.find((p) => p.id === id);
    if (found) {
      return toWatchlistItem({
        ...found,
        supplier: found.supplier || "microinform",
      });
    }
  } catch {
    /* fall through to hint */
  }

  if (hint?.sku || hint?.name) {
    const price =
      typeof hint.price === "number" && Number.isFinite(hint.price) ? hint.price : 0;
    return {
      id,
      sku: (hint.sku || "").trim(),
      name: (hint.name || hint.sku || `ID ${id}`).trim(),
      supplier: id >= 2_000_000 ? "microinform" : "ssd",
      price,
      priceWithoutVat: price > 0 ? Number((price / 1.2).toFixed(2)) : 0,
      costPrice: null,
      brand: (hint.brand || "").trim(),
      sectionName: (hint.sectionName || "").trim(),
      articul: "",
    };
  }

  return null;
}

/** Minimal ProductRaw for SERP scan from a stored watchlist snapshot. */
export function watchlistItemToProductRaw(item: PriceAnalysisWatchlistItem): ProductRaw {
  return {
    id: item.id,
    name: item.name,
    original_name: item.name,
    custom_name: null,
    sku: item.sku,
    supplier: item.supplier === "microinform" || item.supplier === "ssd" ? item.supplier : undefined,
    visible: true,
    section_id: 0,
    section_name: item.sectionName,
    price: item.price,
    calculated_price: item.price,
    price_override: null,
    price_without_vat: item.priceWithoutVat,
    vat_amount: Math.max(0, item.price - item.priceWithoutVat),
    currency: "Br",
    currency_code: "BYN",
    vendor: item.brand,
    metadata: {
      articul: item.articul || item.sku,
      type: "",
      url: "",
      sections: [],
      brand: item.brand,
      unit: "шт",
      minQty: 1,
      multiplicity: 1,
      timeDelivery: "",
      weight: 0,
      volume: 0,
      updated: "",
      pictures: [],
      video: [],
      documents: [],
      zamena: [],
      analog: [],
      soputst: [],
      chars: [],
      description: "",
      cost_price: item.costPrice,
    },
  };
}
