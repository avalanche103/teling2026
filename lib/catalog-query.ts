import type { ActiveFilters, ProductSort } from "@/lib/types";

export type CatalogLayout = "grid" | "list";

export function parseSort(value: string | string[] | undefined): ProductSort {
  const raw = Array.isArray(value) ? value[0] : value;
  switch (raw) {
    case "price_asc":
    case "price_desc":
    case "name":
    case "sku":
    case "relevance":
      return raw;
    default:
      return "relevance";
  }
}

export function parseLayout(value: string | string[] | undefined): CatalogLayout {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "list" ? "list" : "grid";
}

export function parseActiveFilters(
  query: Record<string, string | string[] | undefined>
): ActiveFilters {
  const toArray = (v: string | string[] | undefined): string[] =>
    !v ? [] : Array.isArray(v) ? v : [v];

  const brands = toArray(query.brand).map((b) => b.trim()).filter(Boolean);
  const priceMinStr = toArray(query.price_min)[0];
  const priceMaxStr = toArray(query.price_max)[0];
  const priceMin = priceMinStr ? Number(priceMinStr) : null;
  const priceMax = priceMaxStr ? Number(priceMaxStr) : null;

  const charFilters: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(query)) {
    if (!key.startsWith("cf_") || !val) continue;
    const name = key.slice(3);
    if (!name) continue;
    charFilters[name] = (Array.isArray(val) ? val : [val])
      .map((v) => v.trim())
      .filter(Boolean);
  }

  return {
    brands,
    priceMin: Number.isFinite(priceMin) ? priceMin : null,
    priceMax: Number.isFinite(priceMax) ? priceMax : null,
    charFilters,
  };
}

export function hasActiveFilters(active: ActiveFilters): boolean {
  return (
    active.brands.length > 0 ||
    active.priceMin !== null ||
    active.priceMax !== null ||
    Object.keys(active.charFilters).length > 0
  );
}

export interface CatalogQueryState {
  q?: string;
  page?: number;
  sort?: ProductSort;
  layout?: CatalogLayout;
  view?: "all";
  filters?: ActiveFilters;
}

export function buildCatalogSearchParams(state: CatalogQueryState): URLSearchParams {
  const p = new URLSearchParams();
  const q = state.q?.trim();
  if (q) p.set("q", q);
  if (state.page && state.page > 1) p.set("page", String(state.page));
  if (state.sort && state.sort !== "relevance") p.set("sort", state.sort);
  if (state.layout === "list") p.set("layout", "list");
  if (state.view === "all") p.set("view", "all");

  const filters = state.filters;
  if (filters) {
    for (const b of filters.brands) p.append("brand", b);
    if (filters.priceMin !== null) p.set("price_min", String(filters.priceMin));
    if (filters.priceMax !== null) p.set("price_max", String(filters.priceMax));
    for (const [charName, vals] of Object.entries(filters.charFilters)) {
      for (const v of vals) p.append(`cf_${charName}`, v);
    }
  }

  return p;
}

export function buildCatalogHref(
  pathname: string,
  state: CatalogQueryState
): string {
  const qs = buildCatalogSearchParams(state).toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function getPaginationItems(
  current: number,
  total: number
): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const items: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) items.push("ellipsis");
  for (let i = start; i <= end; i += 1) items.push(i);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}
