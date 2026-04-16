import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { formatPrice } from "@/lib/format";

interface ProductCardProps {
  product: ProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
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
          <div className="flex h-full items-center justify-center text-sm text-red-300">
            Нет фото
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-red-500">
          Артикул: {product.sku}
        </p>

        <h3 className="line-clamp-3 text-sm font-semibold text-red-950">
          {product.name}
        </h3>

        <p className="mt-auto text-sm text-red-800/80">{product.brand}</p>

        <div className="rounded-xl bg-slate-100 px-3 py-2">
          <span className="text-lg font-bold text-red-800">
            {formatPrice(product.price, product.currency)}
          </span>
        </div>
      </div>
    </Link>
  );
}
