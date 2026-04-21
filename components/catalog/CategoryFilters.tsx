"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { SlidersHorizontal, X, ChevronDown, ChevronUp } from "lucide-react";
import type { SectionFacets, ActiveFilters } from "@/lib/types";

export type { ActiveFilters };

interface Props {
  facets: SectionFacets;
  active: ActiveFilters;
  /** Current text search query — preserved when filter changes */
  searchQuery: string;
}

function buildUrl(
  pathname: string,
  active: ActiveFilters,
  searchQuery: string
): string {
  const p = new URLSearchParams();
  if (searchQuery) p.set("q", searchQuery);
  for (const b of active.brands) p.append("brand", b);
  if (active.priceMin !== null) p.set("price_min", String(active.priceMin));
  if (active.priceMax !== null) p.set("price_max", String(active.priceMax));
  for (const [charName, vals] of Object.entries(active.charFilters)) {
    for (const v of vals) p.append(`cf_${charName}`, v);
  }
  const qs = p.toString();
  return `${pathname}${qs ? "?" + qs : ""}`;
}

export function CategoryFilters({ facets, active, searchQuery }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(["brand", ...facets.chars.slice(0, 2).map((c) => c.name)])
  );
  const [priceMinInput, setPriceMinInput] = useState(
    active.priceMin !== null ? String(active.priceMin) : ""
  );
  const [priceMaxInput, setPriceMaxInput] = useState(
    active.priceMax !== null ? String(active.priceMax) : ""
  );

  const navigate = (next: ActiveFilters) =>
    router.push(buildUrl(pathname, next, searchQuery));

  const toggleBrand = (brand: string) => {
    const brands = active.brands.includes(brand)
      ? active.brands.filter((b) => b !== brand)
      : [...active.brands, brand];
    navigate({ ...active, brands });
  };

  const toggleChar = (charName: string, value: string) => {
    const curr = active.charFilters[charName] ?? [];
    const next = curr.includes(value)
      ? curr.filter((v) => v !== value)
      : [...curr, value];
    const cf = { ...active.charFilters };
    if (next.length) cf[charName] = next;
    else delete cf[charName];
    navigate({ ...active, charFilters: cf });
  };

  const applyPrice = () => {
    navigate({
      ...active,
      priceMin: priceMinInput !== "" ? Number(priceMinInput) : null,
      priceMax: priceMaxInput !== "" ? Number(priceMaxInput) : null,
    });
  };

  const clearAll = () => {
    setPriceMinInput("");
    setPriceMaxInput("");
    navigate({ brands: [], priceMin: null, priceMax: null, charFilters: {} });
  };

  const toggleGroup = (name: string) =>
    setOpenGroups((prev) => {
      const s = new Set(prev);
      s.has(name) ? s.delete(name) : s.add(name);
      return s;
    });

  const activeCount =
    active.brands.length +
    Object.keys(active.charFilters).length +
    (active.priceMin !== null || active.priceMax !== null ? 1 : 0);

  const panel = (
    <div className="text-left">
      {activeCount > 0 && (
        <button
          onClick={clearAll}
          className="mb-4 flex items-center gap-1.5 text-xs font-medium text-black/50 hover:text-black"
        >
          <X className="h-3 w-3" />
          Сбросить все фильтры
        </button>
      )}

      {/* Price */}
      {facets.priceMax > facets.priceMin && facets.priceMax > 0 && (
        <div className="pb-4">
          <div className="mb-2.5 text-sm font-semibold">Цена, Br</div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder={String(Math.floor(facets.priceMin))}
              value={priceMinInput}
              onChange={(e) => setPriceMinInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
            />
            <span className="shrink-0 text-slate-400">–</span>
            <input
              type="number"
              min={0}
              placeholder={String(Math.ceil(facets.priceMax))}
              value={priceMaxInput}
              onChange={(e) => setPriceMaxInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <button
            onClick={applyPrice}
            className="mt-2 w-full rounded-lg bg-slate-100 py-1.5 text-sm font-medium hover:bg-slate-200"
          >
            Применить
          </button>
        </div>
      )}

      {/* Brands */}
      {facets.brands.length > 1 && (
        <FacetGroup
          title="Производитель"
          open={openGroups.has("brand")}
          onToggle={() => toggleGroup("brand")}
          items={facets.brands.map(({ value, count }) => ({
            label: value,
            count,
            checked: active.brands.includes(value),
            onChange: () => toggleBrand(value),
          }))}
        />
      )}

      {/* Dynamic char facets */}
      {facets.chars.map((facet) => (
        <FacetGroup
          key={facet.name}
          title={facet.name}
          open={openGroups.has(facet.name)}
          onToggle={() => toggleGroup(facet.name)}
          items={facet.values.map(({ value, count }) => ({
            label: value,
            count,
            checked: (active.charFilters[facet.name] ?? []).includes(value),
            onChange: () => toggleChar(facet.name, value),
          }))}
        />
      ))}
    </div>
  );

  return (
    <>
      {/* Mobile toggle */}
      <div className="mb-5 lg:hidden">
        <button
          onClick={() => setMobileOpen((o) => !o)}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium shadow-sm"
        >
          <SlidersHorizontal className="h-4 w-4" />
          Фильтры
          {activeCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-black px-1 text-xs text-white">
              {activeCount}
            </span>
          )}
        </button>

        {mobileOpen && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            {panel}
          </div>
        )}
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm font-semibold">Фильтры</span>
            {activeCount > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-black/50 hover:text-black"
              >
                Сбросить
              </button>
            )}
          </div>
          {panel}
        </div>
      </aside>
    </>
  );
}

// ---- FacetGroup ----

interface FacetGroupProps {
  title: string;
  open: boolean;
  onToggle: () => void;
  items: {
    label: string;
    count: number;
    checked: boolean;
    onChange: () => void;
  }[];
}

function FacetGroup({ title, open, onToggle, items }: FacetGroupProps) {
  const [showAll, setShowAll] = useState(false);
  const MAX = 8;
  const visible = showAll ? items : items.slice(0, MAX);
  const hiddenCount = items.length - MAX;

  return (
    <div className="border-t border-slate-100 py-3">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left text-sm font-semibold"
      >
        <span>{title}</span>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5 text-black/40" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-black/40" />
        )}
      </button>

      {open && (
        <ul className="mt-2.5 space-y-1.5">
          {visible.map((item) => (
            <li key={item.label}>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={item.onChange}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                />
                <span className="flex-1 leading-tight text-black/85">
                  {item.label}
                </span>
                <span className="shrink-0 text-xs text-black/35">
                  {item.count}
                </span>
              </label>
            </li>
          ))}

          {!showAll && hiddenCount > 0 && (
            <li>
              <button
                onClick={() => setShowAll(true)}
                className="text-xs text-black/50 hover:text-black"
              >
                Ещё {hiddenCount}…
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
