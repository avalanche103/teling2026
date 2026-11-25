import type { ProductCharGroup, ProductRaw } from "@/lib/types";
import { has } from "./chars/shared";

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isWeakDescription(text: string): boolean {
  const t = stripHtml(text);
  if (!t) return true;
  if (t.length < 40) return true;
  if (!/[А-Яа-яЁё]/.test(t)) return true;
  return false;
}

/** Prefer Cyrillic price/name text for local MOXA enrich. */
export function pickMoxaSourceText(product: ProductRaw): string {
  const name = (product.custom_name || product.name || "").trim();
  const desc = stripHtml(product.metadata?.description || "");
  if (!isWeakDescription(desc)) {
    if (name.length > desc.length + 40 && /[А-Яа-яЁё]/.test(name)) return name;
    return desc;
  }
  if (/[А-Яа-яЁё]/.test(name)) return name;
  return desc || name;
}

function splitFacts(text: string): string[] {
  const parts = text
    .split(/[.;|]/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 8);
  if (parts.length <= 2) {
    return text
      .split(/,(?=\s*[А-ЯA-Z])/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length >= 8);
  }
  return parts;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatMoxaPriceDescriptionHtml(sourceText: string, articul: string): string {
  const text = sourceText.replace(/\s+/g, " ").trim();
  if (!text) return "";
  const facts = splitFacts(text).slice(0, 12);
  const lead = facts[0] || text;
  const rest = facts.slice(1);
  const blocks: string[] = [];
  blocks.push(`<p>${escapeHtml(lead)}</p>`);
  if (rest.length) {
    blocks.push("<ul>");
    for (const fact of rest) blocks.push(`<li>${escapeHtml(fact)}</li>`);
    blocks.push("</ul>");
  }
  if (articul) {
    blocks.push(`<p><strong>Артикул:</strong> ${escapeHtml(articul)}</p>`);
  }
  return blocks.join("\n");
}

function pushDetail(items: Array<{ name: string; value: string }>, name: string, value: string | null) {
  if (!value) return;
  if (items.some((i) => i.name === name)) return;
  items.push({ name, value: value.slice(0, 500) });
}

export function buildDetailedMoxaCharsFromText(
  sectionTitle: string,
  name: string,
  articul: string,
  sourceText: string,
): ProductCharGroup[] {
  const hay = `${sectionTitle} ${name} ${articul} ${sourceText}`.toLowerCase();
  const items: Array<{ name: string; value: string }> = [];

  if (has(hay, "nport") || has(hay, "serial", "device server") && has(hay, "ethernet")) {
    pushDetail(items, "Класс", "Serial↔Ethernet");
  } else if (has(hay, "uport") || (has(hay, "usb") && has(hay, "rs-"))) {
    pushDetail(items, "Класс", "USB-Serial");
  } else if (has(hay, "mgate", "modbus", "profibus")) {
    pushDetail(items, "Класс", "Шлюз");
  } else if (has(hay, "коммутатор", "switch")) {
    pushDetail(items, "Класс", "Коммутатор");
  } else if (has(hay, "медиаконверт")) {
    pushDetail(items, "Класс", "Медиаконвертер");
  }

  const ports = sourceText.match(/(\d+)\s*порт/i)?.[1];
  if (ports) pushDetail(items, "Число портов", ports);

  if (has(hay, "rs-232/422/485", "rs-232/422/485")) pushDetail(items, "Последовательный интерфейс", "RS-232/422/485");
  else if (has(hay, "rs-422/485")) pushDetail(items, "Последовательный интерфейс", "RS-422/485");
  else if (has(hay, "rs-232")) pushDetail(items, "Последовательный интерфейс", "RS-232");
  else if (has(hay, "rs-485")) pushDetail(items, "Последовательный интерфейс", "RS-485");

  if (/-t\b/.test(articul.toLowerCase()) || has(hay, "-40", "расширенн")) {
    pushDetail(items, "Температура", "Расширенная");
  }

  if (!items.length) return [];
  return [{ name: "Параметры", items }];
}

/** Apply RU description/chars from price text when manufacturer scrape is unavailable. */
export function applyLocalMoxaEnrich(product: ProductRaw): ProductRaw {
  const articul = product.metadata?.articul || product.sku;
  const source = pickMoxaSourceText(product);
  if (!source || !/[А-Яа-яЁё]/.test(source)) return product;

  const html = formatMoxaPriceDescriptionHtml(source, articul);
  const detailed = buildDetailedMoxaCharsFromText(
    product.metadata?.price_section || product.section_name || "",
    product.name || "",
    articul,
    source,
  );

  const existing = product.metadata?.chars || [];
  const nextChars: ProductCharGroup[] = [];
  const seen = new Set<string>();
  const push = (g: ProductCharGroup) => {
    const key = g.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    nextChars.push(g);
  };
  for (const g of existing) {
    if (g.name === "Характеристики") push(g);
  }
  for (const g of detailed) push(g);
  for (const g of existing) push(g);

  const currentUrl = (product.metadata?.url || "").trim();
  const keepUrl =
    currentUrl && !/moxa\.com(?!\.ua)/i.test(currentUrl) ? currentUrl : currentUrl || "";

  return {
    ...product,
    metadata: {
      ...product.metadata,
      description: html,
      chars: nextChars,
      url: keepUrl || product.metadata?.url || "",
    },
  };
}
