"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatPrice, hasPrice } from "@/lib/format";

const STORAGE_KEY = "viewed-products-skus";
const HISTORY_LIMIT = 20;
const RENDER_LIMIT = 8;

interface ViewedProductsProps {
  currentSku: string;
}

interface ViewedProductsResponse {
  items: ProductSummary[];
}

function readViewedSkus(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

function writeViewedSkus(skus: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(skus));
}

function mergeCurrentSku(currentSku: string, existing: string[]): string[] {
  const normalized = [currentSku, ...existing]
    .map((sku) => sku.trim())
    .filter((sku) => sku.length > 0);
  return Array.from(new Set(normalized)).slice(0, HISTORY_LIMIT);
}

export function ViewedProducts({ currentSku }: ViewedProductsProps) {
  const [items, setItems] = useState<ProductSummary[]>([]);

  useEffect(() => {
    const merged = mergeCurrentSku(currentSku, readViewedSkus());
    writeViewedSkus(merged);

    const requestSkus = merged.filter((sku) => sku !== currentSku).slice(0, RENDER_LIMIT);
    if (requestSkus.length === 0) {
      setItems([]);
      return;
    }

    const params = new URLSearchParams();
    for (const sku of requestSkus) params.append("sku", sku);

    fetch(`/api/products/by-skus?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ViewedProductsResponse;
        const bySku = new Map(data.items.map((item) => [item.sku, item]));
        // Keep history order from localStorage in final cards.
        const ordered = requestSkus
          .map((sku) => bySku.get(sku) ?? null)
          .filter((item): item is ProductSummary => Boolean(item));
        setItems(ordered);
      })
      .catch(() => {
        setItems([]);
      });
  }, [currentSku]);

  const visibleItems = useMemo(() => items.slice(0, RENDER_LIMIT), [items]);

  if (visibleItems.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="mb-4 text-xl font-black text-black">Вы смотрели</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {visibleItems.map((product) => (
          <Link
            key={`viewed-${product.sku}`}
            href={`/product/${product.sku}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="relative h-44 bg-slate-100">
              {product.thumbnail ? (
                <Image
                  src={product.thumbnail}
                  alt={product.name}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Нет фото
                </div>
              )}
            </div>

            <div className="flex flex-1 flex-col gap-2 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-black/70">
                Артикул: {product.sku}
              </p>

              <h3 className="line-clamp-3 text-sm font-semibold text-black">
                {product.name}
              </h3>

              <p className="mt-auto text-sm text-black/80">{product.brand}</p>

              <div className="rounded-xl bg-slate-100 px-3 py-2">
                <span className="text-lg font-bold text-black">
                  {formatPrice(product.price, product.currency)}
                </span>
                {hasPrice(product.price) && (
                  <span className="ml-2 text-xs text-black/60">с НДС</span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
