import Link from "next/link";
import type { Metadata } from "next";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { getRootCategories, searchProducts } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface CatalogIndexPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

export async function generateMetadata({ searchParams }: CatalogIndexPageProps): Promise<Metadata> {
  const params = await searchParams;
  const hasQuery = Boolean((params.q || "").trim());

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
  const q = (params.q || "").trim();
  const categories = getRootCategories();
  const results = q ? searchProducts(q, 60) : [];
  const origin = getSiteOrigin();

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
          const prev = idx > 0
            ? `${origin}/product/${encodeURIComponent(results[idx - 1]!.sku)}`
            : undefined;
          const next = idx < results.length - 1
            ? `${origin}/product/${encodeURIComponent(results[idx + 1]!.sku)}`
            : undefined;

          return {
            "@type": "ListItem",
            position: idx + 1,
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
          const prev = idx > 0 ? `${origin}/catalog/${categories[idx - 1]!.slug}` : undefined;
          const next = idx < categories.length - 1 ? `${origin}/catalog/${categories[idx + 1]!.slug}` : undefined;

          return {
            "@type": "ListItem",
            position: idx + 1,
            ...(prev ? { previousItem: prev } : {}),
            ...(next ? { nextItem: next } : {}),
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
        <div className="mb-8 flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase tracking-[0.22em] text-black/70">
            Каталог продукции
          </p>
          <h1 className="text-3xl font-black tracking-tight text-black">
            Категории и товары
          </h1>
        </div>

        {q ? (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-black">
              Результаты поиска: {q}
            </h2>
            {results.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-black/80">
                Ничего не найдено. Попробуйте другой артикул или название.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {results.map((product) => (
                  <ProductCard key={product.sku} product={product} />
                ))}
              </div>
            )}

            <div className="pt-4">
              <Link href="/catalog" className="text-sm font-semibold text-black hover:text-black/80">
                Сбросить поиск
              </Link>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <h2 className="text-xl font-bold text-black">Основные разделы</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {categories.map((category) => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
