import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductListRow } from "@/components/catalog/ProductListRow";
import { ProductLayoutToggle } from "@/components/catalog/ProductLayoutToggle";
import { CategoryFilters } from "@/components/catalog/CategoryFilters";
import { CategorySearchForm } from "@/components/catalog/CategorySearchForm";
import { ActiveFilterChips } from "@/components/catalog/ActiveFilterChips";
import { CatalogSortSelect } from "@/components/catalog/CatalogSortSelect";
import { CatalogPagination } from "@/components/catalog/CatalogPagination";
import { SeoLandingTags } from "@/components/catalog/SeoLandingTags";
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getSectionFacets,
  getSectionSelectedFilters,
  getSectionProducts,
} from "@/lib/data";
import {
  buildCatalogHref,
  hasActiveFilters,
  parseActiveFilters,
  parseLayout,
  parseSort,
} from "@/lib/catalog-query";
import {
  getBrandSeoHrefMap,
  listSeoLandingTags,
  resolveSeoLanding,
} from "@/lib/seo-landings";
import type { ActiveFilters, SectionFacets } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface LandingPageProps {
  params: Promise<{ slug: string; landingSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function getSiteOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.SITE_URL?.trim() ||
    "https://teling.by";
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

function hasNonCanonicalQuery(
  params: Record<string, string | string[] | undefined>
): boolean {
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

export async function generateMetadata({
  params,
  searchParams,
}: LandingPageProps): Promise<Metadata> {
  const { slug, landingSlug } = await params;
  const query = await searchParams;
  const landing = resolveSeoLanding(slug, landingSlug);

  if (!landing) {
    return {
      title: "Раздел не найден",
      robots: { index: false, follow: false },
    };
  }

  const hasQuery = hasNonCanonicalQuery(query);

  return {
    title: landing.title,
    description: landing.description,
    alternates: {
      canonical: landing.href,
    },
    openGraph: {
      title: `${landing.h1} - Каталог Teling.by`,
      description: landing.description,
      url: landing.href,
      type: "website",
    },
    robots: hasQuery
      ? { index: false, follow: true }
      : { index: true, follow: true },
  };
}

export default async function SeoLandingPage({
  params,
  searchParams,
}: LandingPageProps) {
  const { slug, landingSlug } = await params;
  const query = await searchParams;

  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const landing = resolveSeoLanding(slug, landingSlug);
  if (!landing) notFound();

  const page = Math.max(1, Number(query.page || 1));
  const search = (typeof query.q === "string" ? query.q : "").trim();
  const sort = parseSort(query.sort);
  const layout = parseLayout(query.layout);
  const viewAll = stringifyFirst(query.view) === "all";

  const activeFromQuery = parseActiveFilters(query);
  // Brand landing locks the brand; series landings keep optional brand filters from query.
  const lockedBrands = landing.brands ?? [];
  const mergedActive: ActiveFilters = {
    ...activeFromQuery,
    brands: lockedBrands.length ? lockedBrands : activeFromQuery.brands,
  };

  const selectedFilterKeys = getSectionSelectedFilters(category.id);
  const effectiveFilters = applySelectedFilterKeysToActive(
    mergedActive,
    selectedFilterKeys
  );

  const facets = applySelectedFacetKeys(
    getSectionFacets(category.id, {
      search,
      nameIncludes: landing.nameIncludes,
      active: hasActiveFilters(effectiveFilters) ? effectiveFilters : undefined,
    }),
    selectedFilterKeys
  );

  const hasFacets = Boolean(
    facets.brands.length > 1 ||
      facets.chars.length > 0 ||
      facets.priceMax > facets.priceMin
  );

  const { products, total } = getSectionProducts(category.id, {
    page,
    limit: PAGE_SIZE,
    search,
    includeDescendants: true,
    brands: effectiveFilters.brands.length ? effectiveFilters.brands : undefined,
    nameIncludes: landing.nameIncludes,
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
  const canonicalUrl = `${origin}${landing.href}`;
  const brandSeoHrefs = getBrandSeoHrefMap(slug);
  const seoTags = listSeoLandingTags(slug);

  // Pagination / sort stay on the landing path; brand is in the path for brand landings.
  const filtersForHref: ActiveFilters = {
    ...effectiveFilters,
    brands: lockedBrands.length ? [] : effectiveFilters.brands,
  };

  const hrefForPage = (nextPage: number) =>
    buildCatalogHref(landing.href, {
      q: search,
      page: nextPage,
      sort,
      layout,
      filters: filtersForHref,
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
        item: `${origin}/catalog/${category.slug}`,
      },
      {
        "@type": "ListItem",
        position: ancestors.length + 4,
        name: landing.displayName,
        item: canonicalUrl,
      },
    ],
  };

  const productItemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: landing.h1,
    url: canonicalUrl,
    numberOfItems: products.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: products.map((product, idx) => {
      const productUrl = `${origin}/product/${encodeURIComponent(product.sku)}`;
      const prev =
        idx > 0
          ? `${origin}/product/${encodeURIComponent(products[idx - 1]!.sku)}`
          : undefined;
      const next =
        idx < products.length - 1
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

  // Chips: for brand landing show locked brand as removable → back to category.
  const chipsActive: ActiveFilters = lockedBrands.length
    ? { ...effectiveFilters, brands: lockedBrands }
    : effectiveFilters;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsSchema) }}
        suppressHydrationWarning
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productItemListSchema) }}
        suppressHydrationWarning
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
        <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-black/70">
          <Link href="/" className="hover:text-black">
            Главная
          </Link>
          <span>/</span>
          <Link href="/catalog" className="hover:text-black">
            Каталог
          </Link>
          {ancestors.map((a) => (
            <span key={a.id} className="contents">
              <span>/</span>
              <Link href={`/catalog/${a.slug}`} className="hover:text-black">
                {a.name}
              </Link>
            </span>
          ))}
          <span>/</span>
          <Link href={`/catalog/${category.slug}`} className="hover:text-black">
            {category.name}
          </Link>
          <span>/</span>
          <span className="font-semibold text-black">{landing.displayName}</span>
        </div>

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-black/70">
              Подборка
            </p>
            <h1 className="text-2xl font-black tracking-tight text-black sm:text-3xl">
              {landing.h1}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {landing.productCount.toLocaleString("ru-RU")} позиций в подборке
            </p>
          </div>

          <CategorySearchForm
            search={search}
            active={filtersForHref}
            sort={sort}
            layout={layout}
            viewAll={viewAll}
          />
        </div>

        <SeoLandingTags tags={seoTags} activeLabel={landing.displayName} />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {hasFacets && (
            <CategoryFilters
              facets={facets}
              active={chipsActive}
              searchQuery={search}
              sort={sort}
              layout={layout}
              viewAll={viewAll}
              categorySlug={slug}
              brandSeoHrefs={brandSeoHrefs}
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
                active={chipsActive}
                searchQuery={search}
                sort={sort}
                layout={layout}
                viewAll={viewAll}
                categorySlug={slug}
                brandSeoHrefs={brandSeoHrefs}
              />

              {products.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-white p-4 text-black/75">
                  {search || hasActiveFilters(effectiveFilters)
                    ? "Ничего не найдено. Снимите часть фильтров или измените запрос."
                    : "В этой подборке пока нет товаров."}
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
      </main>
    </>
  );
}
