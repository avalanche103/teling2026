"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ProductSort } from "@/lib/types";

const OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "relevance", label: "По умолчанию" },
  { value: "price_asc", label: "Цена ↑" },
  { value: "price_desc", label: "Цена ↓" },
  { value: "name", label: "Название" },
  { value: "sku", label: "Артикул" },
];

interface CatalogSortSelectProps {
  value: ProductSort;
}

export function CatalogSortSelect({ value }: CatalogSortSelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className="inline-flex items-center gap-2 text-sm text-black/70">
      <span className="shrink-0">Сортировка</span>
      <select
        value={value}
        onChange={(e) => {
          const next = new URLSearchParams(searchParams.toString());
          const sort = e.target.value as ProductSort;
          if (sort === "relevance") next.delete("sort");
          else next.set("sort", sort);
          next.delete("page");
          const qs = next.toString();
          router.push(qs ? `${pathname}?${qs}` : pathname);
        }}
        className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm text-black outline-none focus:border-slate-400"
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}
