import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getSectionProducts,
} from "@/lib/data";

interface CategoryPageProps {
  params: Promise<{
    slug: string;
  }>;
  searchParams: Promise<{
    q?: string;
    page?: string;
  }>;
}

const PAGE_SIZE = 24;

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { slug } = await params;
  const query = await searchParams;

  const category = getCategoryBySlug(slug);
  if (!category) notFound();

  const page = Math.max(1, Number(query.page || 1));
  const search = (query.q || "").trim();

  const { products, total } = getSectionProducts(category.id, {
    page,
    limit: PAGE_SIZE,
    search,
    includeDescendants: true,
  });

  const ancestors = getCategoryAncestors(category.id);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-red-800/70">
        <Link href="/" className="hover:text-red-950">Главная</Link>
        <span>/</span>
        <Link href="/catalog" className="hover:text-red-950">Каталог</Link>
        {ancestors.map((a) => (
          <span key={a.id} className="contents">
            <span>/</span>
            <Link href={`/catalog/${a.slug}`} className="hover:text-red-950">
              {a.name}
            </Link>
          </span>
        ))}
        <span>/</span>
        <span className="font-semibold text-red-950">{category.name}</span>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-red-700">Раздел</p>
          <h1 className="text-3xl font-black tracking-tight text-red-950">{category.name}</h1>
        </div>

        <form className="w-full sm:w-96" action="" method="get">
          <input
            name="q"
            defaultValue={search}
            placeholder="Поиск в категории"
            className="h-10 w-full rounded-xl border border-red-200 bg-white px-3 text-sm outline-none ring-red-500 transition focus:ring-2"
          />
        </form>
      </div>

      {category.children.length > 0 && !search && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-bold text-red-950">Подкатегории</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {category.children.map((child) => (
              <CategoryCard key={child.id} category={child} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-bold text-red-950">
          Товары {search ? `(по запросу: ${search})` : ""}
        </h2>

        {products.length === 0 ? (
          <p className="rounded-xl border border-red-200 bg-white p-4 text-red-800/75">
            В этом разделе пока нет товаров.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.sku} product={product} />
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 text-sm">
          <p className="text-red-800/75">Всего найдено: {total}</p>
          <div className="flex items-center gap-3">
            {page > 1 && (
              <Link
                href={`/catalog/${slug}?${new URLSearchParams({
                  ...(search ? { q: search } : {}),
                  page: String(page - 1),
                }).toString()}`}
                className="rounded-lg border border-red-200 px-3 py-1.5 hover:bg-slate-100"
              >
                Назад
              </Link>
            )}
            <span className="text-red-700/70">{page} / {totalPages}</span>
            {page < totalPages && (
              <Link
                href={`/catalog/${slug}?${new URLSearchParams({
                  ...(search ? { q: search } : {}),
                  page: String(page + 1),
                }).toString()}`}
                className="rounded-lg border border-red-200 px-3 py-1.5 hover:bg-slate-100"
              >
                Вперед
              </Link>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
