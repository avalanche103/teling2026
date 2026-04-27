import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CategoryFilters } from "@/components/catalog/CategoryFilters";
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getSectionFacets,
  getSectionSelectedFilters,
  getSectionProducts,
} from "@/lib/data";
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
  const knownKeys = ["q", "page", "brand", "price_min", "price_max"];

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
  
  // Get product count for better description
  const { total: productCount } = getSectionProducts(category.id, {
    page: 1,
    limit: 1,
    includeDescendants: true,
  });

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

function parseFilters(
  query: Record<string, string | string[] | undefined>
): ActiveFilters {
  const toArray = (v: string | string[] | undefined): string[] =>
    !v ? [] : Array.isArray(v) ? v : [v];

  const brands = toArray(query.brand);
  const priceMinStr = toArray(query.price_min)[0];
  const priceMaxStr = toArray(query.price_max)[0];
  const priceMin = priceMinStr ? Number(priceMinStr) : null;
  const priceMax = priceMaxStr ? Number(priceMaxStr) : null;

  const charFilters: Record<string, string[]> = {};
  for (const [key, val] of Object.entries(query)) {
    if (!key.startsWith("cf_") || !val) continue;
    charFilters[key.slice(3)] = Array.isArray(val) ? val : [val];
  }

  return { brands, priceMin, priceMax, charFilters };
}

function buildPageUrl(
  slug: string,
  page: number,
  search: string,
  active: ActiveFilters
): string {
  const p = new URLSearchParams();
  if (search) p.set("q", search);
  if (page > 1) p.set("page", String(page));
  for (const b of active.brands) p.append("brand", b);
  if (active.priceMin !== null) p.set("price_min", String(active.priceMin));
  if (active.priceMax !== null) p.set("price_max", String(active.priceMax));
  for (const [charName, vals] of Object.entries(active.charFilters)) {
    for (const v of vals) p.append(`cf_${charName}`, v);
  }
  const qs = p.toString();
  return `/catalog/${slug}${qs ? "?" + qs : ""}`;
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

  const activeFilters = parseFilters(query);
  const selectedFilterKeys = getSectionSelectedFilters(category.id);
  const facets = applySelectedFacetKeys(
    getSectionFacets(category.id),
    selectedFilterKeys
  );
  const effectiveFilters = applySelectedFilterKeysToActive(
    activeFilters,
    selectedFilterKeys
  );
  const hasFacets =
    facets.brands.length > 1 ||
    facets.chars.length > 0 ||
    facets.priceMax > facets.priceMin;

  const { products, total } = getSectionProducts(category.id, {
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
  });

  const ancestors = getCategoryAncestors(category.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const origin = getSiteOrigin();
  const canonicalPath = `/catalog/${category.slug}`;
  const canonicalUrl = `${origin}${canonicalPath}`;

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
          "@type": "Product",
          name: product.name,
          sku: product.sku,
          url: productUrl,
          ...(product.thumbnail
            ? {
                image: product.thumbnail.startsWith("http")
                  ? product.thumbnail
                  : `${origin}${product.thumbnail}`,
              }
            : {}),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productItemListSchema) }}
        suppressHydrationWarning
      />
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
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-black/70">Раздел</p>
          <h1 className="text-3xl font-black tracking-tight text-black">{category.name}</h1>
        </div>

        <form className="w-full sm:w-96" action="" method="get">
          <input
            name="q"
            defaultValue={search}
            placeholder="Поиск в категории"
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-400 transition focus:ring-2"
          />
        </form>
      </div>

      {category.children.length > 0 && !search && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-black">Подкатегории</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {category.children.map((child) => (
              <CategoryCard key={child.id} category={child} />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {hasFacets && (
          <CategoryFilters
            facets={facets}
            active={effectiveFilters}
            searchQuery={search}
          />
        )}

        <div className="min-w-0 flex-1">
          <section className="space-y-4">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-lg font-bold text-black">
                Товары{" "}
                {search ? (
                  <span className="font-normal text-black/60">
                    (по запросу: {search})
                  </span>
                ) : null}
              </h2>
              <span className="shrink-0 text-sm text-black/50">
                {total} позиций
              </span>
            </div>

            {products.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-black/75">
                В этом разделе пока нет товаров.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {products.map((product) => (
                  <ProductCard key={product.sku} product={product} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 text-sm">
                <p className="text-black/60">
                  Страница {page} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  {page > 1 && (
                    <Link
                      href={buildPageUrl(slug, page - 1, search, effectiveFilters)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-100"
                    >
                      ← Назад
                    </Link>
                  )}
                  {page < totalPages && (
                    <Link
                      href={buildPageUrl(slug, page + 1, search, effectiveFilters)}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-100"
                    >
                      Вперед →
                    </Link>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
    </>
  );
}
