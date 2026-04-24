import Link from "next/link";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { getRootCategories } from "@/lib/data";
import { getContentBlock } from "@/lib/content";

const COMPANY_DIRECTIONS = [
  "локальные вычислительные сети корпоративного назначения",
  "волоконно-оптические линии связи",
  "системы видеонаблюдения",
  "кабельное ТВ",
  "мультимедийные системы",
];

const CONTACTS = {
  address: "г. Минск, ул. Шафарнянская, 11, офис 33",
  phones: [
    "+375 (17) 270-50-95",
    "+375 (17) 270-50-96",
    "+375 (17) 270-50-97",
    "+375 (17) 270-50-98",
    "+375 (17) 270-50-99 (факс)",
  ],
  workTime: "Пн-Пт 9.00 - 18.00",
  email: "info@teling.by",
};

export default async function HomePage() {
  const topCategories = getRootCategories().slice(0, 4);
  
  // Load dynamic content blocks
  const [heroBlock, aboutBlock, contactsBlock] = await Promise.all([
    getContentBlock("hero"),
    getContentBlock("about"),
    getContentBlock("contacts"),
  ]);

  return (
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
          <p className="mt-3 whitespace-pre-wrap text-black/80">{contactsBlock?.content || CONTACTS.address}</p>
          <ul className="mt-4 space-y-1 text-black">
            {CONTACTS.phones.map((phone) => (
              <li key={phone}>
                <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="hover:text-black/80">
                  {phone}
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-black/80">{CONTACTS.workTime}</p>
          <a className="mt-3 inline-block text-black hover:text-black/80" href={`mailto:${CONTACTS.email}`}>
            {CONTACTS.email}
          </a>
        </div>
      </section>
    </main>
  );
}
