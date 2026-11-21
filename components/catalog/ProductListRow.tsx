import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/types";
import { formatPrice, hasPrice } from "@/lib/format";
import { AddToRequestButton } from "@/components/request/AddToRequestButton";

interface ProductListRowProps {
  product: ProductSummary;
}

export function ProductListRow({ product }: ProductListRowProps) {
  const showVatLabel = hasPrice(product.price);
  const href = `/product/${encodeURIComponent(product.sku)}`;

  return (
    <article className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-slate-300 hover:shadow-md sm:p-4">
      <Link
        href={href}
        className="relative h-40 w-32 shrink-0 overflow-hidden rounded-xl bg-slate-100"
      >
        {product.thumbnail ? (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            sizes="128px"
            className="object-contain p-1"
          />
        ) : (
          <div className="flex h-40 w-32 flex-col items-center justify-center gap-1 px-2 text-center">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Фото скоро
            </span>
          </div>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-mono text-xs font-semibold tracking-wide text-black/70">
            {product.sku}
          </p>
          <Link href={href} title={product.name}>
            <h3 className="text-base font-semibold leading-snug text-black hover:underline">
              {product.name}
            </h3>
          </Link>
          {product.brand ? (
            <p className="text-sm text-black/80">{product.brand}</p>
          ) : null}
          {product.highlights && product.highlights.length > 0 ? (
            <ul className="space-y-0.5 text-xs text-slate-600">
              {product.highlights.map((line) => (
                <li key={line} className="truncate" title={line}>
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex w-36 shrink-0 flex-col gap-2 sm:items-end">
          <div className="w-full rounded-xl bg-slate-100 px-3 py-2 text-right">
            <div className="text-lg font-bold leading-tight text-black">
              {formatPrice(product.price, product.currency)}
            </div>
            {showVatLabel ? (
              <div className="mt-0.5 text-xs text-black/60">с НДС</div>
            ) : null}
          </div>
          <AddToRequestButton sku={product.sku} qty={1} compact label="В запрос" />
        </div>
      </div>
    </article>
  );
}
