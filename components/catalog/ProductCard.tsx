import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { formatPrice, hasPrice } from "@/lib/format";
import { AddToRequestButton } from "@/components/request/AddToRequestButton";

interface ProductCardProps {
  product: ProductSummary;
}

export function ProductCard({ product }: ProductCardProps) {
  const showVatLabel = hasPrice(product.price);
  const href = `/product/${encodeURIComponent(product.sku)}`;

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link href={href} className="relative block min-h-[220px] bg-slate-100">
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-contain p-2 transition duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-1 px-4 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Фото скоро
            </span>
            <span className="line-clamp-2 text-xs text-slate-400">{product.sku}</span>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="font-mono text-xs font-semibold tracking-wide text-black/70">
          {product.sku}
        </p>

        <Link href={href} title={product.name}>
          <h3 className="line-clamp-2 text-base font-semibold text-black hover:underline">
            {product.name}
          </h3>
        </Link>

        {product.brand ? (
          <p className="text-sm text-black/80">{product.brand}</p>
        ) : null}

        {product.highlights && product.highlights.length > 0 ? (
          <ul className="space-y-0.5 text-xs text-black/55">
            {product.highlights.map((line) => (
              <li key={line} className="truncate" title={line}>
                {line}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-auto rounded-xl bg-slate-100 px-3 py-2 text-center">
          <span className="text-lg font-bold text-black">
            {formatPrice(product.price, product.currency)}
          </span>
          {showVatLabel && <span className="ml-2 text-xs text-black/60">с НДС</span>}
        </div>

        <AddToRequestButton sku={product.sku} qty={1} compact label="В запрос" />
      </div>
    </article>
  );
}
