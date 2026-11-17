import Link from "next/link";
import { getPaginationItems } from "@/lib/catalog-query";

interface CatalogPaginationProps {
  page: number;
  totalPages: number;
  hrefForPage: (page: number) => string;
}

export function CatalogPagination({
  page,
  totalPages,
  hrefForPage,
}: CatalogPaginationProps) {
  if (totalPages <= 1) return null;

  const items = getPaginationItems(page, totalPages);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 pt-3 text-sm"
      aria-label="Пагинация"
    >
      <p className="text-black/60">
        Страница {page} / {totalPages}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 && (
          <Link
            href={hrefForPage(page - 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-100"
            rel="prev"
          >
            ← Назад
          </Link>
        )}
        {items.map((item, idx) =>
          item === "ellipsis" ? (
            <span key={`e-${idx}`} className="px-1 text-black/40">
              …
            </span>
          ) : (
            <Link
              key={item}
              href={hrefForPage(item)}
              aria-current={item === page ? "page" : undefined}
              className={
                item === page
                  ? "rounded-lg bg-slate-900 px-3 py-1.5 font-semibold text-white"
                  : "rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-100"
              }
            >
              {item}
            </Link>
          )
        )}
        {page < totalPages && (
          <Link
            href={hrefForPage(page + 1)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-100"
            rel="next"
          >
            Вперед →
          </Link>
        )}
      </div>
    </nav>
  );
}
