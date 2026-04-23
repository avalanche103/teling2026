import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGallery } from "@/components/product/ProductGallery";
import { getCategoryById, getProductBySku } from "@/lib/data";
import { formatPrice, formatPriceValue, hasPrice, normalizeCurrency } from "@/lib/format";

interface ProductPageProps {
  params: Promise<{
    sku: string;
  }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { sku } = await params;
  const product = getProductBySku(sku);
  if (!product) notFound();

  const category = getCategoryById(product.sectionId);
  const showVatDetails = hasPrice(product.price);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-black/70">
        <Link href="/" className="hover:text-black">Главная</Link>
        <span>/</span>
        <Link href="/catalog" className="hover:text-black">Каталог</Link>
        {category && (
          <>
            <span>/</span>
            <Link href={`/catalog/${category.slug}`} className="hover:text-black">
              {category.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="font-semibold text-black">{product.sku}</span>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr]">
        <ProductGallery
          localImages={product.localImages}
          alt={product.name}
        />

        <div className="space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/70">
            Артикул {product.sku}
          </p>
          <h1 className="text-2xl font-black tracking-tight text-black">
            {product.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 text-sm text-black/80">
            <span className="rounded-full bg-slate-100 px-3 py-1">Бренд: {product.brand || "—"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Тип: {product.type || "—"}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1">Ед.: {product.unit || "шт"}</span>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/70">Цена</p>
            <p className="mt-2 text-3xl font-black text-black">
              {formatPrice(product.price, product.currency)}
            </p>
            {showVatDetails && (
              <p className="mt-1 text-sm text-black/60">
                (без НДС {formatPriceValue(product.priceWithoutVat)} {normalizeCurrency(product.currency)})
              </p>
            )}
          </div>

          {product.timeDelivery && (
            <p className="text-sm text-black/75">Срок поставки: {product.timeDelivery}</p>
          )}

          {product.documents.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-700">
                Документы
              </h2>
              <ul className="space-y-1 text-sm">
                {product.documents.slice(0, 6).map((doc, idx) => (
                  <li key={`${doc.url}-${idx}`}>
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-black hover:text-black/80 hover:underline"
                    >
                      {doc.type}: {doc.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <section className="mt-10 space-y-6">
        {product.description && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-3 text-lg font-bold text-black">Описание</h2>
            <div
              className="prose prose-slate max-w-none prose-headings:text-black prose-p:text-black prose-li:text-black"
              // Trusted supplier HTML from imported JSON source.
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}

        {product.chars.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="mb-4 text-lg font-bold text-black">Характеристики</h2>
            <div className="space-y-5">
              {product.chars.map((group, idx) => (
                <div key={`${group.name}-${idx}`}>
                  <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-black/70">
                    {group.name}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <tbody>
                        {group.items.map((item, itemIdx) => (
                          <tr key={`${item.name}-${itemIdx}`} className="odd:bg-slate-100/80">
                            <td className="w-1/2 border-b border-slate-200 px-3 py-2 text-black/80">
                              {item.name}
                            </td>
                            <td className="border-b border-slate-200 px-3 py-2 font-medium text-black">
                              {item.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
