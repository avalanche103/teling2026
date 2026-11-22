import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductCharacteristics } from "@/components/product/ProductCharacteristics";
import { ProductViewTracker } from "@/components/product/ProductViewTracker";
import { ViewedProducts } from "@/components/product/ViewedProducts";
import { ProductAddToRequest } from "@/components/request/ProductAddToRequest";
import {
  getCategoryAncestors,
  getCategoryById,
  getProductBySku,
  getProductSummaryBySku,
} from "@/lib/data";
import { formatPrice, formatPriceValue, hasPrice, normalizeCurrency } from "@/lib/format";
import { getOfferMerchantPolicies } from "@/lib/merchant-policies";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ProductPageProps {
  params: Promise<{
    sku: string;
  }>;
}

function decodeBasicEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => {
      const n = Number(code);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const n = Number.parseInt(hex, 16);
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : _;
    });
}

function stripHtml(input: string): string {
  return decodeBasicEntities(input)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function schemaProductImages(
  product: {
    thumbnail?: string | null;
    localImages?: string[];
    externalImages?: string[];
  },
  origin: string,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [
    product.thumbnail,
    ...(product.localImages || []),
    ...(product.externalImages || []),
  ]) {
    if (!raw) continue;
    const abs = toAbsoluteUrl(raw, origin);
    if (!abs || seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/** Google Merchant listings: description max 5000; name practical max ~150. */
const SCHEMA_DESCRIPTION_MAX = 5000;
const SCHEMA_NAME_MAX = 150;

function truncatePlain(text: string, max: number): string {
  if (text.length <= max) return text;
  const sliced = text.slice(0, max - 1);
  const breakAt = Math.max(sliced.lastIndexOf(" "), sliced.lastIndexOf("."), sliced.lastIndexOf(","));
  const base = breakAt > max * 0.6 ? sliced.slice(0, breakAt) : sliced;
  return `${base.trimEnd()}…`;
}

function schemaProductDescription(productName: string, sku: string, rawHtml: string): string {
  const plain = stripHtml(rawHtml || "");
  if (plain.length >= 30) return truncatePlain(plain, SCHEMA_DESCRIPTION_MAX);
  // Too short / empty → fallback (GSC flags empty and tiny description values).
  return truncatePlain(
    `Товар ${productName} (артикул ${sku}) в каталоге телекоммуникационного оборудования Teling.by.`,
    SCHEMA_DESCRIPTION_MAX,
  );
}

function schemaProductName(name: string): string {
  const plain = name.replace(/\s+/g, " ").trim();
  return truncatePlain(plain, SCHEMA_NAME_MAX);
}

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

function toAbsoluteUrl(pathOrUrl: string, origin: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (pathOrUrl.startsWith("http://") || pathOrUrl.startsWith("https://")) return pathOrUrl;
  return `${origin}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { sku } = await params;
  const product = getProductBySku(sku);
  const origin = getSiteOrigin();

  if (!product) {
    return {
      title: "Товар не найден",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const shortDescription = stripHtml(product.description || "").slice(0, 180);
  const description = shortDescription || `Товар ${product.name} (артикул ${product.sku}) в каталоге Teling.by.`;
  const canonicalPath = `/product/${encodeURIComponent(product.sku)}`;
  const imageUrl = product.thumbnail ? toAbsoluteUrl(product.thumbnail, origin) : undefined;

  return {
    title: `${product.name} (${product.sku})`,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title: `${product.name} - Teling.by`,
      description,
      url: canonicalPath,
      type: "website",
      images: imageUrl ? [{ url: imageUrl, alt: product.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} - Teling.by`,
      description,
      images: imageUrl ? [imageUrl] : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { sku } = await params;
  const product = getProductBySku(sku);
  if (!product) notFound();
  const origin = getSiteOrigin();

  const category = getCategoryById(product.sectionId);
  const ancestors = category ? getCategoryAncestors(category.id) : [];
  const crumbCategories = category ? [...ancestors, category] : [];
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

  const canonicalPath = `/product/${encodeURIComponent(product.sku)}`;
  const offerSchema = hasPrice(product.price)
    ? {
        "@type": "Offer",
        url: `${origin}${canonicalPath}`,
        priceCurrency: product.currencyCode || product.currency || "BYN",
        price: String(product.price),
        availability: "https://schema.org/InStock",
        ...getOfferMerchantPolicies(origin),
      }
    : undefined;

  const schemaImages = schemaProductImages(product, origin);
  const brandName = (product.brand || "").trim();
  const schemaBrand =
    brandName && !/^unknown$/i.test(brandName) && !/^noname$/i.test(brandName)
      ? { "@type": "Brand" as const, name: brandName }
      : undefined;

  // Merchant listings require image — omit Product JSON-LD when none (keeps BreadcrumbList).
  const productSchema =
    schemaImages.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: schemaProductName(product.name),
          sku: product.sku,
          ...(schemaBrand ? { brand: schemaBrand } : {}),
          description: schemaProductDescription(
            product.name,
            product.sku,
            product.description || "",
          ),
          image: schemaImages.length === 1 ? schemaImages[0] : schemaImages,
          ...(offerSchema ? { offers: offerSchema } : {}),
        }
      : null;

  const breadcrumbSchema = {
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
      ...crumbCategories.map((cat, idx) => ({
        "@type": "ListItem",
        position: idx + 3,
        name: cat.name,
        item: `${origin}/catalog/${cat.slug}`,
      })),
      {
        "@type": "ListItem",
        position: crumbCategories.length + 3,
        name: product.name,
        item: `${origin}${canonicalPath}`,
      },
    ],
  };

  return (
    <>
      {productSchema ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productSchema) }}
          suppressHydrationWarning
        />
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
        suppressHydrationWarning
      />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 lg:px-6">
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-black/70">
        <Link href="/" className="hover:text-black">Главная</Link>
        <span>/</span>
        <Link href="/catalog" className="hover:text-black">Каталог</Link>
        {crumbCategories.map((cat) => (
          <span key={cat.id} className="contents">
            <span>/</span>
            <Link href={`/catalog/${cat.slug}`} className="hover:text-black">
              {cat.name}
            </Link>
          </span>
        ))}
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

          <ProductAddToRequest sku={product.sku} minQty={product.minQty} />

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
              className="product-description prose prose-slate min-h-0 max-w-none flex-1 overflow-y-auto pr-1 text-[15px] leading-7 text-black prose-headings:text-black prose-p:text-black prose-li:text-black prose-strong:text-black [&_p]:text-justify [&_p]:indent-6 [&_p]:leading-7 [&_p]:mb-4 [&_p:last-child]:mb-0 [&_div]:mb-3 [&_div:last-child]:mb-0 [&_td]:align-top [&_table]:w-full"
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedProducts.slice(0, 8).map((item) => (
                  <ProductCard key={`related-${item.sku}`} product={item} />
                ))}
              </div>
            </div>
          )}

          {similarProducts.length > 0 && (
            <div>
              <h2 className="mb-4 text-xl font-black text-black">Похожие товары</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {similarProducts.slice(0, 8).map((item) => (
                  <ProductCard key={`similar-${item.sku}`} product={item} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <ProductViewTracker sku={product.sku} />
      <ViewedProducts currentSku={product.sku} />
    </main>
    </>
  );
}
