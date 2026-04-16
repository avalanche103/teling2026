import Link from "next/link";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { getRootCategories, searchProducts } from "@/lib/data";

interface CatalogIndexPageProps {
  searchParams: Promise<{
    q?: string;
  }>;
}

export const metadata = {
  title: "Каталог | Teling.by",
};

export default async function CatalogIndexPage({ searchParams }: CatalogIndexPageProps) {
  const params = await searchParams;
  const q = (params.q || "").trim();
  const categories = getRootCategories();
  const results = q ? searchProducts(q, 60) : [];

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
      <div className="mb-8 flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-red-700">
          Каталог продукции
        </p>
        <h1 className="text-3xl font-black tracking-tight text-red-950">
          Категории и товары
        </h1>
      </div>

      {q ? (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-red-950">
            Результаты поиска: {q}
          </h2>
          {results.length === 0 ? (
            <p className="rounded-2xl border border-red-200 bg-white p-4 text-red-700/80">
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
            <Link href="/catalog" className="text-sm font-semibold text-red-700 hover:text-red-900">
              Сбросить поиск
            </Link>
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-red-950">Основные разделы</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {categories.map((category) => (
              <CategoryCard key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
