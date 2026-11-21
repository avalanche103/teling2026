"use client";

import { LayoutGrid, List } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogLayout } from "@/lib/catalog-query";

interface ProductLayoutToggleProps {
  value: CatalogLayout;
}

export function ProductLayoutToggle({ value }: ProductLayoutToggleProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setLayout = (layout: CatalogLayout) => {
    if (layout === value) return;
    const next = new URLSearchParams(searchParams.toString());
    if (layout === "list") next.set("layout", "list");
    else next.delete("layout");
    next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <div
      className="inline-flex rounded-lg border border-slate-200 bg-white p-1"
      role="group"
      aria-label="Вид списка"
    >
      <button
        type="button"
        onClick={() => setLayout("grid")}
        aria-pressed={value === "grid"}
        title="Плитка"
        className={
          value === "grid"
            ? "rounded-md bg-slate-900 p-2 text-white"
            : "rounded-md p-2 text-slate-600 hover:text-black"
        }
      >
        <LayoutGrid className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setLayout("list")}
        aria-pressed={value === "list"}
        title="Список"
        className={
          value === "list"
            ? "rounded-md bg-slate-900 p-2 text-white"
            : "rounded-md p-2 text-slate-600 hover:text-black"
        }
      >
        <List className="h-4 w-4" />
      </button>
    </div>
  );
}
