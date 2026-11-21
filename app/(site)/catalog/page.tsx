import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductListRow } from "@/components/catalog/ProductListRow";
import { ProductLayoutToggle } from "@/components/catalog/ProductLayoutToggle";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { CatalogSortSelect } from "@/components/catalog/CatalogSortSelect";
import { ActiveFilterChips } from "@/components/catalog/ActiveFilterChips";
import {
  getRootCategories,
  getSectionProductCount,
  searchProductsPaged,
} from "@/lib/data";
import {
  buildCatalogHref,
  parseActiveFilters,
  parseLayout,
  parseSort,
} from "@/lib/catalog-query";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CatalogIndexPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

const PAGE_SIZE = 24;

export async function generateMetadata({ searchParams }: CatalogIndexPageProps): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Boolean((typeof params.q === "string" ? params.q : "").trim());

  return {
    title: hasQuery ? `Поиск по каталогу: ${params.q}` : "Каталог продукции",
    description: hasQuery
      ? `Результаты поиска товаров по запросу «${params.q}» в каталоге Teling.by.`
      : "Каталог телекоммуникационного оборудования: категории, бренды и товары для ЛВС, ВОЛС и видеонаблюдения.",
    alternates: {
      canonical: "/catalog",
    },
    robots: hasQuery
      ? {
          index: false,
          follow: true,
        }
      : {
          index: true,
          follow: true,
        },
  };
}

export default async function CatalogIndexPage({ searchParams }: CatalogIndexPageProps) {
  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();
  const page = Math.max(1, Number(params.page || 1));
  const sort = parseSort(params.sort);
  const layout = parseLayout(params.layout);
  const filters = parseActiveFilters(params);
  const categories = getRootCategories();
  const origin = getSiteOrigin();

  const searchResult = q
    ? searchProductsPaged(q, {
        page,
        limit: PAGE_SIZE,
        sort,
        brands: filters.brands.length ? filters.brands : undefined,
        priceMin: filters.priceMin ?? undefined,
        priceMax: filters.priceMax ?? undefined,
      })
    : null;

  const results = searchResult?.products ?? [];
  const total = searchResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sectionHints = searchResult?.sectionHints ?? [];

  const itemListSchema = q
    ? {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Результаты поиска: ${q}`,
        url: `${origin}/catalog?q=${encodeURIComponent(q)}`,
        numberOfItems: results.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: results.map((product, idx) => {
          const productUrl = `${origin}/product/${encodeURIComponent(product.sku)}`;
          return {
            "@type": "ListItem",
            position: (page - 1) * PAGE_SIZE + idx + 1,
            item: {
              "@type": "Thing",
              name: product.name,
              url: productUrl,
            },
          };
        }),
      }
    : {
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: "Основные разделы каталога",
        url: `${origin}/catalog`,
        numberOfItems: categories.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: categories.map((category, idx) => {
          const categoryUrl = `${origin}/catalog/${category.slug}`;
          return {
            "@type": "ListItem",
            position: idx + 1,
            item: {
              "@type": "Thing",
              name: category.name,
              url: categoryUrl,
            },
          };
        }),
      };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        suppressHydrationWarning
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-8 flex flex-col gap-2">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-black/70">
            Каталог продукции
          </p>
          <h1 className="text-3xl font-black tracking-tight text-black">
            {q ? `Поиск: ${q}` : "Основные разделы"}
          </h1>
        </div>

        {q ? (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-black/60">
                Найдено {total.toLocaleString("ru-RU")} позиций
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Suspense fallback={null}>
                  <ProductLayoutToggle value={layout} />
                </Suspense>
                <Suspense fallback={null}>
                  <CatalogSortSelect value={sort} />
                </Suspense>
              </div>
            </div>

            <ActiveFilterChips
              active={filters}
              searchQuery={q}
              sort={sort}
              layout={layout}
            />

            {sectionHints.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-slate-600">Искать в разделе:</span>
                {sectionHints.map((hint) => (
                  <Link
                    key={hint.slug}
                    href={`/catalog/${hint.slug}?q=${encodeURIComponent(q)}`}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm hover:border-slate-400"
                  >
                    {hint.name}
                    <span className="ml-1 text-black/40">({hint.count})</span>
                  </Link>
                ))}
              </div>
            )}

            {results.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-black/80">
                Ничего не найдено. Попробуйте другой артикул или название.
              </p>
            ) : layout === "list" ? (
              <div className="flex flex-col gap-3">
                {results.map((product) => (
                  <ProductListRow key={product.sku} product={product} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {results.map((product) => (
                  <ProductCard key={product.sku} product={product} />
                ))}
              </div>
            )}

            <CatalogPagination
              page={page}
              totalPages={totalPages}
              hrefForPage={(nextPage) =>
                buildCatalogHref("/catalog", {
                  q,
                  page: nextPage,
                  sort,
                  layout,
                  filters,
                })
              }
            />

            <div className="pt-2">
              <Link href="/catalog" className="text-sm font-semibold text-black hover:text-black/80">
                К разделам каталога
              </Link>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {categories.map((category) => (
                <CategoryCard
                  key={category.id}
                  category={category}
                  productCount={getSectionProductCount(category.id)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
