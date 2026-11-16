"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Category } from "@/lib/types";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
  const initial = category.imageUrl?.trim() || null;
  const fallback = category.fallbackImageUrl?.trim() || null;
  const [src, setSrc] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);

  return (
    <Link
      href={`/catalog/${category.slug}`}
      className="group flex min-h-60 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-3">
        <h3 className="line-clamp-2 text-base font-semibold text-slate-900">
          {category.name}
        </h3>
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
