import {
  getProductSummaryBySku,
  searchProductsPaged,
} from "@/lib/data";
import type { ProductSummary } from "@/lib/types";

const SITE_ORIGIN = "https://teling.by";
const MAX_RESULTS = 5;

/** Short chitchat / FAQ — do not run catalog search. */
const NON_CATALOG_RE =
  /^(привет|здравствуй(те)?|добрый\s+(день|вечер|утро)|hi|hello|hey|спасибо|благодарю|ок|окей|хорошо|понятно|ладно|пока|до\s+свидания|до\s+связи)[\s!.?…]*$/i;

const FAQ_ONLY_RE =
  /(доставк|самовывоз|адрес|где\s+вы|телефон|email|e-mail|почт|режим\s+работ|график|работаете|беларус|росси[юя]|оплат|безнал|ндс|\bсч[её]т)/i;

/** Canonical short phrases for typo-tolerant greeting detection. */
const CHITCHAT_CANONICAL = [
  "привет",
  "приветик",
  "здравствуйте",
  "здравствуй",
  "добрый день",
  "добрый вечер",
  "доброе утро",
  "hi",
  "hello",
  "hey",
  "спасибо",
  "благодарю",
  "пока",
  "до свидания",
];

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/** «привте» ≈ «привет» — не гоняем в каталог. */
function looksLikeChitchatTypo(text: string): boolean {
  const q = text
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[!?.,…]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!q || q.length > 24) return false;
  for (const canon of CHITCHAT_CANONICAL) {
    const maxDist = canon.length <= 5 ? 1 : canon.length <= 9 ? 2 : 3;
    if (Math.abs(q.length - canon.length) > maxDist) continue;
    if (editDistance(q, canon) <= maxDist) return true;
  }
  return false;
}

function formatPrice(p: ProductSummary): string {
  if (!Number.isFinite(p.price) || p.price <= 0) return "цена по запросу";
  const code = (p.currencyCode || p.currency || "BYN").trim() || "BYN";
  const value = Number.isInteger(p.price)
    ? String(p.price)
    : p.price.toFixed(2);
  return `${value} ${code}`;
}

function formatProductLine(p: ProductSummary): string {
  const brand = p.brand ? `; бренд: ${p.brand}` : "";
  const section = p.sectionName ? `; раздел: ${p.sectionName}` : "";
  const link = `${SITE_ORIGIN}/product/${encodeURIComponent(p.sku)}`;
  return `- ${p.name} | SKU ${p.sku}${brand}${section}; цена: ${formatPrice(p)}; ссылка: ${link}`;
}

/** Pull likely SKU tokens from free text (alphanumeric with -._). */
function extractSkuCandidates(text: string): string[] {
  const matches = text.match(/[A-Za-z0-9][A-Za-z0-9._-]{2,40}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (/^\d+$/.test(m) && m.length < 4) continue;
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
    if (out.length >= 5) break;
  }
  return out;
}

function dedupeProducts(items: ProductSummary[]): ProductSummary[] {
  const seen = new Set<string>();
  const out: ProductSummary[] = [];
  for (const p of items) {
    if (!p.sku || seen.has(p.sku)) continue;
    seen.add(p.sku);
    out.push(p);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export function looksLikeProductQuery(text: string): boolean {
  const q = text.trim();
  if (!q) return false;
  if (NON_CATALOG_RE.test(q)) return false;
  if (looksLikeChitchatTypo(q)) return false;
  if (q.length <= 12 && FAQ_ONLY_RE.test(q)) return false;
  if (FAQ_ONLY_RE.test(q) && !/[A-Za-z0-9]{3,}/.test(q) && q.split(/\s+/).length <= 6) {
    if (
      !/\b(кабел|коммутатор|свитч|роутер|камер|оптик|патч|коннектор|муфт|шкаф|артикул|sku|купить|нужен|нужна|ищу|есть\s+ли)\b/i.test(
        q
      )
    ) {
      return false;
    }
  }
  if (extractSkuCandidates(q).some((t) => /[0-9]/.test(t) || t.length >= 5)) {
    return true;
  }
  if (q.split(/\s+/).length >= 2) return true;
  // Single short token without digits — often typo/chitchat; let the model decide.
  if (q.split(/\s+/).length === 1 && q.length <= 10 && !/[0-9]/.test(q)) {
    return false;
  }
  return q.length >= 4 && !NON_CATALOG_RE.test(q);
}

/**
 * Catalog facts for the LLM, or null when search should not run / not inject.
 */
export function buildCatalogContext(visitorText: string): string | null {
  const q = visitorText.trim();
  if (!q || !looksLikeProductQuery(q)) {
    return null;
  }

  const found: ProductSummary[] = [];

  for (const token of extractSkuCandidates(q)) {
    const bySku = getProductSummaryBySku(token);
    if (bySku) found.push(bySku);
  }

  const exact = getProductSummaryBySku(q);
  if (exact) found.push(exact);

  const paged = searchProductsPaged(q, { page: 1, limit: MAX_RESULTS });
  found.push(...paged.products);

  const products = dedupeProducts(found);
  if (products.length === 0) {
    // Empty hit on a fuzzy/short phrase → don't force «ничего не найдено» into the LLM.
    if (looksLikeChitchatTypo(q) || (q.length <= 12 && !/[0-9]/.test(q))) {
      return null;
    }
    return `КАТАЛОГ: по товарному запросу «${q.slice(0, 120)}» позиций не найдено.`;
  }

  const broadCategory =
    paged.total >= 20 ||
    paged.sectionHints.length >= 2 ||
    q.split(/\s+/).filter(Boolean).length <= 5;

  const lines = [
    "КАТАЛОГ (факты с сайта, можно опираться только на это):",
  ];

  if (paged.sectionHints.length > 0) {
    lines.push(
      broadCategory
        ? "Разделы (для общего запроса дай посетителю эти ссылки в первую очередь):"
        : "Разделы каталога по теме:"
    );
    for (const s of paged.sectionHints.slice(0, 3)) {
      lines.push(
        `- ${s.name} (${s.count} поз.) → ${SITE_ORIGIN}/catalog/${encodeURIComponent(s.slug)}`
      );
    }
  }

  if (!broadCategory || paged.sectionHints.length === 0) {
    lines.push("Позиции:");
    lines.push(...products.map(formatProductLine));
  } else {
    lines.push(
      "Примеры позиций (не перечисляй в ответе, если хватает ссылок на разделы):"
    );
    lines.push(...products.slice(0, 2).map(formatProductLine));
  }

  lines.push(`Всего найдено примерно: ${paged.total}.`);
  if (broadCategory && paged.sectionHints.length > 0) {
    lines.push(
      "Тип запроса: общий/категория — ответь ссылками на разделы, спроси уточнение (оптика / ТПП / ЖД и т.п.)."
    );
  }

  return lines.join("\n");
}
