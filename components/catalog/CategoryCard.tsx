import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/lib/types";

interface CategoryCardProps {
  category: Category;
}

export function CategoryCard({ category }: CategoryCardProps) {
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
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt={category.name}
            fill
            className="object-contain object-bottom transition duration-300 group-hover:scale-105"
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
