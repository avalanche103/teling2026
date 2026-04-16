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
      className="group relative overflow-hidden rounded-2xl border border-red-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 text-base font-semibold text-red-950">
          {category.name}
        </h3>
        <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
          {category.children.length}
        </span>
      </div>

      <div className="relative h-28 overflow-hidden rounded-xl bg-slate-100">
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt={category.name}
            fill
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-red-300">
            Категория
          </div>
        )}
      </div>
    </Link>
  );
}
