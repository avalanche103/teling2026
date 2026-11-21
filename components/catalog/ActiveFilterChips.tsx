"use client";

import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import type { ActiveFilters, ProductSort } from "@/lib/types";
import {
  buildCatalogHref,
  hasActiveFilters,
  type CatalogLayout,
} from "@/lib/catalog-query";

interface ActiveFilterChipsProps {
  active: ActiveFilters;
  searchQuery?: string;
  sort?: ProductSort;
  layout?: CatalogLayout;
  viewAll?: boolean;
}

export function ActiveFilterChips({
  active,
  searchQuery = "",
  sort = "relevance",
  layout = "grid",
  viewAll = false,
}: ActiveFilterChipsProps) {
  const router = useRouter();
  const pathname = usePathname();

  if (!hasActiveFilters(active) && !searchQuery) return null;

  const push = (next: ActiveFilters, nextSearch = searchQuery) => {
    router.push(
      buildCatalogHref(pathname, {
        q: nextSearch,
        sort,
        layout,
        view: viewAll ? "all" : undefined,
        filters: next,
      })
    );
  };

  const chips: Array<{ key: string; label: string; onRemove: () => void }> = [];

  if (searchQuery) {
    chips.push({
      key: "q",
      label: `Поиск: ${searchQuery}`,
      onRemove: () => push(active, ""),
    });
  }

  for (const brand of active.brands) {
    chips.push({
      key: `brand:${brand}`,
      label: brand,
      onRemove: () =>
        push({
          ...active,
          brands: active.brands.filter((b) => b !== brand),
        }),
    });
  }

  if (active.priceMin !== null || active.priceMax !== null) {
    const from = active.priceMin !== null ? String(active.priceMin) : "…";
    const to = active.priceMax !== null ? String(active.priceMax) : "…";
    chips.push({
      key: "price",
      label: `Цена ${from}–${to}`,
      onRemove: () =>
        push({ ...active, priceMin: null, priceMax: null }),
    });
  }

  for (const [name, values] of Object.entries(active.charFilters)) {
    for (const value of values) {
      chips.push({
        key: `cf:${name}:${value}`,
        label: `${name}: ${value}`,
        onRemove: () => {
          const nextVals = values.filter((v) => v !== value);
          const charFilters = { ...active.charFilters };
          if (nextVals.length) charFilters[name] = nextVals;
          else delete charFilters[name];
          push({ ...active, charFilters });
        },
      });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          className="inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-black/80 hover:border-slate-400"
        >
          <span className="truncate">{chip.label}</span>
          <X className="h-3 w-3 shrink-0 opacity-50" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={() =>
            push({ brands: [], priceMin: null, priceMax: null, charFilters: {} }, "")
          }
          className="text-xs font-medium text-slate-600 hover:text-black"
        >
          Сбросить всё
        </button>
      )}
    </div>
  );
}
