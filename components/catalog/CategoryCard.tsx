"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/types";

interface CategoryCardProps {
  category: Category;
  productCount?: number;
}

function formatProductCountLabel(count: number): string {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  const word =
    n > 10 && n < 20
      ? "товаров"
      : n1 === 1
        ? "товар"
        : n1 >= 2 && n1 <= 4
          ? "товара"
          : "товаров";
  return `${count.toLocaleString("ru-RU")} ${word}`;
}

export function CategoryCard({ category, productCount }: CategoryCardProps) {
  const initial = category.imageUrl?.trim() || null;
  const fallback = category.fallbackImageUrl?.trim() || null;
  const [src, setSrc] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href={`/catalog/${category.slug}`}
      title={category.name}
      className="group flex min-h-60 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-3">
        <h3 className="line-clamp-3 text-base font-semibold text-slate-900">
          {category.name}
        </h3>
        {typeof productCount === "number" && (
          <p className="mt-1 text-xs text-black/50">
            {formatProductCountLabel(productCount)}
          </p>
        )}
      </div>

      <div className="relative mt-auto h-40 overflow-hidden rounded-xl bg-slate-100">
        {src && !failed ? (
          <Image
            src={src}
            alt={category.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
            className="object-contain object-bottom transition duration-300 group-hover:scale-105"
            onError={() => {
              if (fallback && src !== fallback) {
                setSrc(fallback);
                return;
              }
              setFailed(true);
            }}
          />
        ) : (
          <div className="flex h-full items-end justify-center pb-3 text-sm text-slate-400">
            Категория
          </div>
        )}
      </div>
    </Link>
  );
}
