import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductListRow } from "@/components/catalog/ProductListRow";
import { ProductLayoutToggle } from "@/components/catalog/ProductLayoutToggle";
import { CategoryFilters } from "@/components/catalog/CategoryFilters";
import { CategorySearchForm } from "@/components/catalog/CategorySearchForm";
import { ActiveFilterChips } from "@/components/catalog/ActiveFilterChips";
import { CatalogSortSelect } from "@/components/catalog/CatalogSortSelect";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getSectionFacets,
  getSectionSelectedFilters,
  getSectionProducts,
  getSectionProductCount,
} from "@/lib/data";
import {
  buildCatalogHref,
  hasActiveFilters,
  parseActiveFilters,
  parseLayout,
  parseSort,
} from "@/lib/catalog-query";
import type { ActiveFilters, SectionFacets } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
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

function stringifyFirst(value: string | string[] | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value[0] || "" : value;
}

function hasNonCanonicalQuery(params: Record<string, string | string[] | undefined>): boolean {
  const knownKeys = ["q", "page", "brand", "price_min", "price_max", "sort", "view", "layout"];

  for (const key of knownKeys) {
    const raw = stringifyFirst(params[key]);
    if (raw.trim()) return true;
  }

  for (const key of Object.keys(params)) {
    if (key.startsWith("cf_")) {
      const raw = stringifyFirst(params[key]);
      if (raw.trim()) return true;
    }
  }

  return false;
}

export async function generateMetadata({ params, searchParams }: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const query = await searchParams;
  const category = getCategoryBySlug(slug);

  if (!category) {
    return {
      title: "Раздел не найден",
      robots: { index: false, follow: false },
    };
  }

  const hasQuery = hasNonCanonicalQuery(query);
  const canonicalPath = `/catalog/${category.slug}`;
  const productCount = getSectionProductCount(category.id);

  const description = productCount > 0
    ? `Купить ${category.name.toLowerCase()} в каталоге Teling.by: ${productCount} товаров, характеристики, цены и наличие оборудования для ЛВС, ВОЛС и видеонаблюдения.`
    : `${category.name} в каталоге Teling.by: профессиональное оборудование для телекоммуникационных сетей.`;

  return {
    title: `${category.name} - Каталог`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${category.name} - Каталог Teling.by`,
      description,
      url: canonicalPath,
      type: "website",
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

function applySelectedFacetKeys(
  facets: SectionFacets,
  selectedKeys: string[] | null
): SectionFacets {
  if (selectedKeys === null) return facets;
  const selectedSet = new Set(selectedKeys);
  return {
    brands: selectedSet.has("brand") ? facets.brands : [],
    priceMin: selectedSet.has("price") ? facets.priceMin : 0,
    priceMax: selectedSet.has("price") ? facets.priceMax : 0,
    chars: facets.chars.filter((facet) => selectedSet.has(`char:${facet.name}`)),
  };
}

function applySelectedFilterKeysToActive(
  active: ActiveFilters,
  selectedKeys: string[] | null
): ActiveFilters {
  if (selectedKeys === null) return active;
  const selectedSet = new Set(selectedKeys);
  const charFilters = Object.fromEntries(
    Object.entries(active.charFilters).filter(([name]) =>
      selectedSet.has(`char:${name}`)
    )
  );
  return {
    brands: selectedSet.has("brand") ? active.brands : [],
    priceMin: selectedSet.has("price") ? active.priceMin : null,
    priceMax: selectedSet.has("price") ? active.priceMax : null,
    charFilters,
  };
}

const PAGE_SIZE = 24;

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const page = Math.max(1, Number(query.page || 1));
  const search = (typeof query.q === "string" ? query.q : "").trim();
  const sort = parseSort(query.sort);
  const layout = parseLayout(query.layout);
  const viewAll = stringifyFirst(query.view) === "all";

  const activeFilters = parseActiveFilters(query);
  const selectedFilterKeys = getSectionSelectedFilters(category.id);
  const effectiveFilters = applySelectedFilterKeysToActive(
    activeFilters,
    selectedFilterKeys
  );

  const forceListing =
    viewAll ||
    Boolean(search) ||
    hasActiveFilters(effectiveFilters) ||
    sort !== "relevance" ||
    page > 1;
  const isHub = category.children.length > 0 && !forceListing;
  const sectionTotal = getSectionProductCount(category.id);

  const facets = isHub
    ? null
    : applySelectedFacetKeys(
        getSectionFacets(category.id, {
          search,
          // Only pay for facet recompute when filters are actually applied.
          active: hasActiveFilters(effectiveFilters) ? effectiveFilters : undefined,
        }),
        selectedFilterKeys
      );

  const hasFacets = Boolean(
    facets &&
      (facets.brands.length > 1 ||
        facets.chars.length > 0 ||
        facets.priceMax > facets.priceMin)
  );

  const { products, total } = isHub
    ? { products: [], total: 0 }
    : getSectionProducts(category.id, {
        page,
        limit: PAGE_SIZE,
        search,
        includeDescendants: true,
        brands: effectiveFilters.brands.length ? effectiveFilters.brands : undefined,
        priceMin: effectiveFilters.priceMin ?? undefined,
        priceMax: effectiveFilters.priceMax ?? undefined,
        charFilters: Object.keys(effectiveFilters.charFilters).length
          ? effectiveFilters.charFilters
          : undefined,
        sort,
      });

  const ancestors = getCategoryAncestors(category.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const origin = getSiteOrigin();
  const canonicalPath = `/catalog/${category.slug}`;
  const canonicalUrl = `${origin}${canonicalPath}`;

  const hrefForPage = (nextPage: number) =>
    buildCatalogHref(`/catalog/${slug}`, {
      q: search,
      page: nextPage,
      sort,
      layout,
      view: viewAll || (category.children.length > 0 && forceListing) ? "all" : undefined,
      filters: effectiveFilters,
    });

  const breadcrumbsSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Главная",
        item: origin,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Каталог",
        item: `${origin}/catalog`,
      },
      ...ancestors.map((a, idx) => ({
        "@type": "ListItem",
        position: idx + 3,
        name: a.name,
        item: `${origin}/catalog/${a.slug}`,
      })),
      {
        "@type": "ListItem",
        position: ancestors.length + 3,
        name: category.name,
        item: canonicalUrl,
      },
    ],
  };

  const productItemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: search
      ? `Результаты поиска в разделе ${category.name}`
      : `Товары раздела ${category.name}`,
    url: canonicalUrl,
    numberOfItems: products.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: products.map((product, idx) => {
      const productUrl = `${origin}/product/${encodeURIComponent(product.sku)}`;
      const prev = idx > 0
        ? `${origin}/product/${encodeURIComponent(products[idx - 1]!.sku)}`
        : undefined;
      const next = idx < products.length - 1
        ? `${origin}/product/${encodeURIComponent(products[idx + 1]!.sku)}`
        : undefined;

      return {
        "@type": "ListItem",
        position: (page - 1) * PAGE_SIZE + idx + 1,
        ...(prev ? { previousItem: prev } : {}),
        ...(next ? { nextItem: next } : {}),
        item: {
          "@type": "Thing",
          name: product.name,
          url: productUrl,
        },
      };
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsSchema) }}
        suppressHydrationWarning
      />
      {!isHub && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productItemListSchema) }}
          suppressHydrationWarning
        />
      )}
      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-black/70">
          <Link href="/" className="hover:text-black">Главная</Link>
          <span>/</span>
          <Link href="/catalog" className="hover:text-black">Каталог</Link>
          {ancestors.map((a) => (
            <span key={a.id} className="contents">
              <span>/</span>
              <Link href={`/catalog/${a.slug}`} className="hover:text-black">
                {a.name}
              </Link>
            </span>
          ))}
          <span>/</span>
          <span className="font-semibold text-black">{category.name}</span>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-black/70">Раздел</p>
            <h1 className="text-2xl font-black tracking-tight text-black sm:text-3xl">
              {category.name}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {sectionTotal.toLocaleString("ru-RU")} позиций в разделе
            </p>
          </div>

          {!isHub && (
            <CategorySearchForm
              search={search}
              active={effectiveFilters}
              sort={sort}
              layout={layout}
              viewAll={viewAll || category.children.length > 0}
            />
          )}
        </div>

        {category.children.length > 0 && (
          <section className="mb-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-lg font-bold text-black">Подкатегории</h2>
              {isHub && sectionTotal > 0 && (
                <Link
                  href={buildCatalogHref(`/catalog/${slug}`, { view: "all" })}
                  className="text-sm font-semibold text-black hover:text-black/70"
                >
                  Смотреть все {sectionTotal.toLocaleString("ru-RU")} товаров →
                </Link>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {category.children.map((child) => (
                <CategoryCard
                  key={child.id}
                  category={child}
                  productCount={getSectionProductCount(child.id)}
                />
              ))}
            </div>
          </section>
        )}

        {isHub ? null : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {hasFacets && facets && (
              <CategoryFilters
                facets={facets}
                active={effectiveFilters}
                searchQuery={search}
                sort={sort}
                layout={layout}
                viewAll={viewAll || category.children.length > 0}
              />
            )}

            <div className="min-w-0 flex-1">
              <section className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-lg font-bold text-black">
                    Товары{" "}
                    {search ? (
                      <span className="font-normal text-black/60">
                        (по запросу: {search})
                      </span>
                    ) : null}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="shrink-0 text-sm text-slate-600">
                      {total.toLocaleString("ru-RU")} позиций
                    </span>
                    <Suspense fallback={null}>
                      <ProductLayoutToggle value={layout} />
                    </Suspense>
                    <Suspense fallback={null}>
                      <CatalogSortSelect value={sort} />
                    </Suspense>
                  </div>
                </div>

                <ActiveFilterChips
                  active={effectiveFilters}
                  searchQuery={search}
                  sort={sort}
                  layout={layout}
                  viewAll={viewAll || category.children.length > 0}
                />

                {products.length === 0 ? (
                  <p className="rounded-xl border border-slate-200 bg-white p-4 text-black/75">
                    {search || hasActiveFilters(effectiveFilters)
                      ? "Ничего не найдено. Снимите часть фильтров или измените запрос."
                      : "В этом разделе пока нет товаров."}
                  </p>
                ) : layout === "list" ? (
                  <div className="flex flex-col gap-3">
                    {products.map((product) => (
                      <ProductListRow key={product.sku} product={product} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {products.map((product) => (
                      <ProductCard key={product.sku} product={product} />
                    ))}
                  </div>
                )}

                <CatalogPagination
                  page={page}
                  totalPages={totalPages}
                  hrefForPage={hrefForPage}
                />
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
