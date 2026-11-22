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
  // Cross-sell notes leaked from price list into description.
  if (/доп\.?\s*батар/i.test(t) && /от\s+svc/i.test(t)) return true;
  if (/^bat\d/i.test(t) && t.length < 80) return true;
  return false;
}

/** Pick best Cyrillic source text for local enrich. */
export function pickUpsSourceText(product: ProductRaw): string {
  const name = (product.custom_name || product.name || "").trim();
  const desc = stripHtml(product.metadata?.description || "");
  if (!isWeakDescription(desc) && /[А-Яа-яЁё]/.test(desc)) {
    // Prefer longer of name/desc when both are good.
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
  // Also split on comma-separated labeled chunks when text is dense.
  if (parts.length <= 2) {
    return text
      .split(/,(?=\s*[А-ЯA-Z])/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length >= 8);
  }
  return parts;
}

export function formatUpsPriceDescriptionHtml(sourceText: string, articul: string): string {
  const text = sourceText.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const facts = splitFacts(text).slice(0, 12);
  const lead = facts[0] || text;
  const rest = facts.slice(1);

  const blocks: string[] = [];
  blocks.push(`<p>${escapeHtml(lead)}</p>`);
  if (rest.length) {
    blocks.push("<ul>");
    for (const fact of rest) {
      blocks.push(`<li>${escapeHtml(fact)}</li>`);
    }
    blocks.push("</ul>");
  }
  if (articul) {
    blocks.push(`<p><strong>Артикул:</strong> ${escapeHtml(articul)}</p>`);
  }
  return blocks.join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pushDetail(items: Array<{ name: string; value: string }>, name: string, value: string | null) {
  if (!value) return;
  if (items.some((i) => i.name === name)) return;
  items.push({ name, value: value.slice(0, 500) });
}

/** Concrete (non-bucket) characteristics parsed from RU price text. */
export function buildDetailedUpsCharsFromText(
  sectionTitle: string,
  name: string,
  articul: string,
  sourceText: string,
): ProductCharGroup[] {
  const hay = `${sectionTitle} ${name} ${articul} ${sourceText}`.toLowerCase();
  const items: Array<{ name: string; value: string }> = [];

  if (has(hay, "онлайн", "on-line", "online", "двойн")) pushDetail(items, "Топология", "Онлайн");
  else if (has(hay, "линейно-интерактив", "line-interactive", "avr", "back")) {
    pushDetail(items, "Топология", "Линейно-интерактивный");
  } else if (has(hay, "инвертор")) pushDetail(items, "Топология", "Инвертор");
  else if (has(hay, "байпас")) pushDetail(items, "Топология", "Байпас");
  else if (has(hay, "pdu", "распредел")) pushDetail(items, "Топология", "PDU");

  const va =
    sourceText.match(/(\d+(?:[.,]\d+)?)\s*кВА/i)?.[1] ||
    sourceText.match(/(\d+(?:[.,]\d+)?)\s*ВА\b/i)?.[1];
  if (va) {
    const n = Number(String(va).replace(",", "."));
    pushDetail(items, "Полная мощность", /кВА/i.test(sourceText) && n <= 50 ? `${n} кВА` : `${va} ВА`);
  }
  const wt = sourceText.match(/(\d+(?:[.,]\d+)?)\s*кВт/i)?.[1] || sourceText.match(/(\d+(?:[.,]\d+)?)\s*Вт\b/i)?.[1];
  if (wt) {
    const n = Number(String(wt).replace(",", "."));
    pushDetail(items, "Активная мощность", /кВт/i.test(sourceText) && n <= 50 ? `${n} кВт` : `${wt} Вт`);
  }

  if (has(hay, "3ф", "трёхфаз", "трехфаз", "400в")) pushDetail(items, "Фазы", "3Ф");
  else if (has(hay, "1ф", "230в", "220в")) pushDetail(items, "Фазы", "1Ф");

  if (has(hay, "стоечн", "rack", "2u", "3u", "1u", "0u", " rt")) pushDetail(items, "Форм-фактор", "Стоечный");
  else if (has(hay, "напольн", "tower")) pushDetail(items, "Форм-фактор", "Напольный");

  const akb = sourceText.match(/АКБ[:\s]*([^,;|]{3,60})/i)?.[1]?.trim();
  if (akb) pushDetail(items, "АКБ", akb);

  const sockets = sourceText.match(/Разъём[ыа]?[:\s]*([^,;|]{3,80})/i)?.[1]?.trim()
    || sourceText.match(/Вых\.?\s*разъём[ыа]?[:\s]*([^,;|]{3,80})/i)?.[1]?.trim();
  if (sockets) pushDetail(items, "Разъёмы", sockets);

  const iface = sourceText.match(/Интерфейс[ыа]?[:\s]*([^,;|]{3,60})/i)?.[1]?.trim()
    || sourceText.match(/Коммуникаци[^\s:]*[:\s]*([^,;|]{3,60})/i)?.[1]?.trim();
  if (iface) pushDetail(items, "Интерфейсы", iface);

  const input = sourceText.match(/Вход[:\s]*([^,;|]{3,60})/i)?.[1]?.trim();
  if (input) pushDetail(items, "Вход", input);
  const output = sourceText.match(/Выход[:\s]*([^,;|]{3,60})/i)?.[1]?.trim();
  if (output) pushDetail(items, "Выход", output);

  if (!items.length) return [];
  return [{ name: "Параметры", items }];
}

export function applyLocalUpsEnrich(product: ProductRaw): ProductRaw {
  const articul = product.metadata?.articul || product.sku;
  const source = pickUpsSourceText(product);
  if (!source || !/[А-Яа-яЁё]/.test(source)) return product;

  const html = formatUpsPriceDescriptionHtml(source, articul);
  const detailed = buildDetailedUpsCharsFromText(
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
  // Keep filter group first, then detailed params.
  for (const g of existing) {
    if (g.name === "Характеристики") push(g);
  }
  for (const g of detailed) push(g);
  for (const g of existing) push(g);

  return {
    ...product,
    metadata: {
      ...product.metadata,
      description: html,
      chars: nextChars,
      // INFORMIX private label — point to RU brand page, not EN manufacturer.
      url:
        product.metadata?.url?.trim() ||
        (/^informix$/i.test(product.vendor || "")
          ? "https://microinform.by/informix/ibp-informix"
          : product.metadata?.url || ""),
    },
  };
}
