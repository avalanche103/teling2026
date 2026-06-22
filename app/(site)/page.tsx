import Link from "next/link";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { getRootCategories } from "@/lib/data";
import { getContentBlock } from "@/lib/content";
import type { ContactsContent } from "@/lib/types";

function getReadableBadgeTextColor(color?: string): string {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return "#ffffff";
  }

  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

const COMPANY_DIRECTIONS = [
  "локальные вычислительные сети корпоративного назначения",
  "волоконно-оптические линии связи",
  "системы видеонаблюдения",
  "кабельное ТВ",
  "мультимедийные системы",
];

const CONTACTS: ContactsContent = {
  address: "г. Минск, ул. Шафарнянская, 11, офис 33",
  phones: [
    { value: "+375(29)665-60-53", href: "tel:+375296656053", badge: "A1", badgeColor: "#e30613" },
    { value: "+375(29) 247-91-04", href: "tel:+375292479104", badge: "МТС", badgeColor: "#d6001c" },
    { value: "+375 (17) 270-50-95", href: "tel:+375172705095" },
    { value: "+375 (17) 270-50-96", href: "tel:+375172705096" },
    { value: "+375 (17) 270-50-97", href: "tel:+375172705097" },
    { value: "+375 (17) 270-50-98", href: "tel:+375172705098" },
    { value: "+375 (17) 270-50-99 (факс)", href: "tel:+375172705099" },
  ],
  email: "info@teling.by",
};

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

export default async function HomePage() {
  const topCategories = getRootCategories().slice(0, 4);
  const origin = getSiteOrigin();
  
  // Load dynamic content blocks
  const [heroBlock, aboutBlock, contactsBlock] = await Promise.all([
    getContentBlock("hero"),
    getContentBlock("about"),
    getContentBlock("contacts"),
  ]);
  const contactsData = contactsBlock?.contacts || CONTACTS;

  // Organization schema for SEO
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Teling.by",
    url: origin,
    logo: `${origin}/teling-circle.jpg`,
    description: "Компания с более чем 20-летним опытом в области телекоммуникаций. Производим и поставляем оборудование, материалы и комплектующие для ввода в эксплуатацию инженерных систем связи.",
    address: {
      "@type": "PostalAddress",
      streetAddress: "ул. Шафарнянская, 11, офис 33",
      addressLocality: "Минск",
      addressCountry: "BY",
    },
    telephone: contactsData.phones[0]?.value || "+375 (17) 270-50-95",
    email: "info@teling.by",
    priceRange: "$$",
    image: `${origin}/og-image.png`,
    areaServed: "BY",
  };

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Teling.by",
    url: origin,
    potentialAction: {
      "@type": "SearchAction",
      target: `${origin}/catalog?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        suppressHydrationWarning
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        suppressHydrationWarning
      />
      <main className="flex-1">
      <section className="relative overflow-hidden border-b border-slate-300 bg-slate-900 text-white">
        <div className="relative mx-auto w-full max-w-7xl px-4 py-12 sm:py-14 lg:px-6 lg:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-200">
            ТЕЛИНГ ГРУПП
          </p>
          <h1 className="mt-3 max-w-4xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            {heroBlock?.title || "Каталог телекоммуникационной продукции для проектирования и монтажа сетей"}
          </h1>
          <p className="mt-5 max-w-3xl text-slate-100/95 sm:text-lg">
            {heroBlock?.content || "Компания с более чем 20-летним опытом в области телекоммуникаций. Производим и поставляем оборудование, материалы и комплектующие для ввода в эксплуатацию инженерных систем связи."}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/catalog"
              className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-100"
            >
              Перейти в каталог
            </Link>
            <a
              href="#contacts"
              className="rounded-xl border border-slate-300/70 px-5 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10"
            >
              Контакты
            </a>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-10 lg:px-6">
        <h2 className="mb-6 text-2xl font-black tracking-tight text-black">
          Каталог продукции
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {topCategories.map((category) => (
            <CategoryCard key={category.id} category={category} />
          ))}
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 px-4 pb-10 lg:grid-cols-[1.2fr_1fr] lg:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black tracking-tight text-black">{aboutBlock?.title || "О компании"}</h2>
          <p className="mt-3 text-black/80">
            {aboutBlock?.content || "Вас приветствует Телинг групп. Мы предлагаем широкий ассортимент оборудования и материалов, позволяющих создать, протестировать и ввести в эксплуатацию линии и сети любой сложности."}
          </p>
          <ul className="mt-4 space-y-2 text-black/85">
            {COMPANY_DIRECTIONS.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-slate-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div id="contacts" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black tracking-tight text-black">{contactsBlock?.title || "Контакты"}</h2>
          <p className="mt-3 text-black/80">{contactsData.address}</p>
          <ul className="mt-4 space-y-2 text-black/85">
            {contactsData.phones.map((phone) => (
              <li key={phone.value} className="flex items-center gap-2">
                <a href={phone.href} className="flex-1 transition-colors hover:text-black">
                  {phone.value}
                </a>
                {phone.badge ? (
                  <span
                    className="inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-extrabold uppercase tracking-wide"
                    style={{
                      backgroundColor: phone.badgeColor || "#dc2626",
                      color: getReadableBadgeTextColor(phone.badgeColor || "#dc2626"),
                    }}
                  >
                    {phone.badge}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <a href={`mailto:${contactsData.email}`} className="mt-2 inline-block text-black/85 transition-colors hover:text-black">
            {contactsData.email}
          </a>
        </div>
      </section>
    </main>
    </>
  );
}
