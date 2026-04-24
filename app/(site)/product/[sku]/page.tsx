import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductCharacteristics } from "@/components/product/ProductCharacteristics";
import { ViewedProducts } from "@/components/product/ViewedProducts";
import { getCategoryById, getProductBySku, getProductSummaryBySku } from "@/lib/data";
import { formatPrice, formatPriceValue, hasPrice, normalizeCurrency } from "@/lib/format";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  const maxCharRows = product.chars.reduce(
    (max, group) => Math.max(max, group.items.length),
    0,
  );
  const charsBasedHeight = maxCharRows > 0 ? 280 + maxCharRows * 48 : 0;
  // 12 lines of description text (leading-7) plus card paddings/title area.
  const minDescriptionHeight = 220 + 12 * 28;
  const sharedDetailsHeight = Math.max(charsBasedHeight, minDescriptionHeight);

  const relatedProducts = Array.from(new Set(product.relatedSkus))
    .filter((relatedSku) => relatedSku && relatedSku !== product.sku)
    .map((relatedSku) => getProductSummaryBySku(relatedSku))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const similarProducts = Array.from(new Set(product.analogSkus))
    .filter((analogSku) => analogSku && analogSku !== product.sku)
    .map((analogSku) => getProductSummaryBySku(analogSku))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

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
          externalImages={product.externalImages}
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

      <section
        className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2"
        style={
          sharedDetailsHeight
            ? ({ "--details-height": `${sharedDetailsHeight}px` } as { [key: string]: string })
            : undefined
        }
      >
        {product.chars.length > 0 && (
          <ProductCharacteristics
            groups={product.chars}
            heightPx={sharedDetailsHeight}
          />
        )}

        {product.description && (
          <div
            className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 lg:h-[var(--details-height)]"
          >
            <h2 className="mb-3 text-lg font-bold text-black">Описание</h2>
            <div
              className="prose prose-slate min-h-0 max-w-none flex-1 overflow-y-auto pr-1 prose-headings:text-black prose-p:text-black prose-li:text-black [&_p]:text-justify [&_p]:indent-6 [&_p]:leading-7 [&_p]:mb-4 [&_p:last-child]:mb-0"
              // Trusted supplier HTML from imported JSON source.
              dangerouslySetInnerHTML={{ __html: product.description }}
            />
          </div>
        )}
      </section>

      {(relatedProducts.length > 0 || similarProducts.length > 0) && (
        <section className="mt-12 space-y-10">
          {relatedProducts.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-black text-black">Сопутствующие товары</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {relatedProducts.slice(0, 8).map((item) => (
                  <ProductCard key={`related-${item.sku}`} product={item} />
                ))}
              </div>
            </div>
          )}

          {similarProducts.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-black text-black">Похожие товары</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {similarProducts.slice(0, 8).map((item) => (
                  <ProductCard key={`similar-${item.sku}`} product={item} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <ViewedProducts currentSku={product.sku} />
    </main>
  );
}
