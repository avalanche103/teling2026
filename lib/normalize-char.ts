/**
 * Normalize product characteristic values for catalog filters / cards.
 * Color rules live in normalize-color.ts; SSD synonym + format rules live here.
 */

import {
  isColorCharName,
  normalizeColorValue,
} from "./normalize-color";

export { isColorCharName, normalizeColorValue };

/** Facet values longer than this are usually Microinform prose dumps. */
export const MAX_FACET_VALUE_LENGTH = 80;

const SUBSCRIPT_DIGITS: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

const TITLE_CASE_ENUM_NAMES = new Set([
  "тип монтажа",
  "материал",
  "покрытие",
  "цвет ленты",
  "назначение",
]);

const TEMPERATURE_NAMES = new Set([
  "рабочая температура, °с",
  "рабочая температура, °c",
  "температура эксплуатации, °с",
  "температура эксплуатации, °c",
  "температура монтажа, °с",
  "температура монтажа, °c",
  "температура хранения, °с",
  "температура хранения, °c",
  "температура хранения",
  "температура",
]);

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function replaceSubscripts(value: string): string {
  return value.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => SUBSCRIPT_DIGITS[ch] || ch);
}

function stripWrappingQuotes(value: string): string {
  const t = value.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("«") && t.endsWith("»")) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function stripOuterParensContent(value: string): string {
  // "W8 (0,8 Мпа)" → "W8"; keep inner-only values untouched
  return value.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

function normalizePureNumber(value: string): string | null {
  const t = value.trim().replace(/\s+/g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  // Keep compact canonical form (trim trailing zeros via Number→String for ints)
  if (Number.isInteger(n)) return String(n);
  // Prefer comma as decimal separator for RU catalog display consistency
  return String(n).replace(".", ",");
}

function cyrillicLookalikeToLatin(value: string): string {
  return value
    .replace(/В/g, "B")
    .replace(/в/g, "b")
    .replace(/А/g, "A")
    .replace(/а/g, "a")
    .replace(/Е/g, "E")
    .replace(/е/g, "e")
    .replace(/С/g, "C")
    .replace(/с/g, "c")
    .replace(/М/g, "M")
    .replace(/м/g, "m")
    .replace(/Н/g, "H")
    .replace(/н/g, "h")
    .replace(/О/g, "O")
    .replace(/о/g, "o")
    .replace(/Р/g, "P")
    .replace(/р/g, "p")
    .replace(/Т/g, "T")
    .replace(/т/g, "t")
    .replace(/Х/g, "X")
    .replace(/х/g, "x");
}

function titleCaseWord(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Normalize temperature range punctuation to "min…+max". */
function normalizeTemperatureRange(raw: string): string {
  let v = collapseSpaces(raw);
  v = v.replace(/–/g, "-").replace(/—/g, "-");
  // Drop trailing degree marks glued to the range
  v = v.replace(/°[CcСс]?$/u, "").trim();
  v = v.replace(/\s*\.\.\.\s*/g, "…");
  v = v.replace(/\s*…\s*/g, "…");
  v = v.replace(/\s+/g, "");
  // Ensure + before positive upper bound when pattern like -40…70
  v = v.replace(/…(\d)/, "…+$1");
  // Re-insert nothing — compact form matches majority of SSD data "-40…+70"
  // But restore sign readability: "-40…+70"
  const m = v.match(/^(-?\d+)…(\+?-?\d+)$/);
  if (m) {
    const lo = m[1];
    let hi = m[2];
    if (!hi.startsWith("+") && !hi.startsWith("-")) hi = `+${hi}`;
    return `${lo}…${hi}`;
  }
  return collapseSpaces(raw);
}

function normalizeConcreteClass(raw: string): string {
  let v = replaceSubscripts(collapseSpaces(raw));
  v = stripOuterParensContent(v);
  // Cyrillic В → Latin B for grade letter only
  v = v.replace(/^[Вв]/u, "B").replace(/^B/i, "B");
  v = v.replace(/\s+/g, "");
  // B22,5 / B22.5
  const m = v.match(/^B(\d+(?:[.,]\d+)?)$/i);
  if (m) return `B${m[1].replace(".", ",")}`;
  return v;
}

function normalizeFrostResistance(raw: string): string {
  let v = replaceSubscripts(collapseSpaces(raw));
  v = stripOuterParensContent(v);
  v = v.replace(/\s+/g, " ").trim();

  // Explicit class + cycles with separator: "F2 200", "F1-100"
  let m = v.match(/^F\s*([12])\s*[- ]\s*(\d{2,3})$/i);
  if (m) return `F${m[1]} ${m[2]}`;

  // Old-style F50 / F100 / F200 (must run before compact F2200 so "F200" ≠ "F2 00")
  m = v.match(/^F\s*(\d{2,3})$/i);
  if (m) {
    const cycles = m[1]!;
    if (cycles === "50" || cycles === "75" || cycles === "100" || cycles === "150") {
      return `F1 ${cycles}`;
    }
    if (cycles === "200" || cycles === "300") {
      return `F2 ${cycles}`;
    }
    return `F${cycles}`;
  }

  // Compact subscript form F₂200 → F2200 → F2 200
  m = v.match(/^F([12])(\d{3})$/i);
  if (m) return `F${m[1]} ${m[2]}`;

  // Trailing junk like F200₂ → F2002
  m = v.match(/^F\s*(\d{3})2$/i);
  if (m) {
    const cycles = m[1]!;
    if (cycles === "200" || cycles === "300") return `F2 ${cycles}`;
    if (cycles === "100" || cycles === "50" || cycles === "75" || cycles === "150") {
      return `F1 ${cycles}`;
    }
  }

  return v;
}

function normalizeWaterResistance(raw: string): string {
  let v = replaceSubscripts(collapseSpaces(raw));
  v = stripOuterParensContent(v);
  v = v.replace(/\s+/g, "").toUpperCase();
  const m = v.match(/^W(\d+)$/i);
  if (m) return `W${m[1]}`;
  return v;
}

function normalizeFiberType(raw: string): string {
  const v = collapseSpaces(raw);
  const lower = v.toLowerCase();
  // "Одномодовое (SM)" / "Одномодовое"
  const smInParen = v.match(/\(\s*SM\s*\)/i);
  if (smInParen || /^одномодов/i.test(lower)) {
    if (/mm/i.test(v) && /sm/i.test(v)) return v; // mixed
    if (smInParen || /^одномодов/i.test(lower)) return "SM";
  }
  const mmInParen = v.match(/\(\s*MM\s*\)/i);
  if (mmInParen || /^многомодов/i.test(lower)) {
    if (/sm/i.test(v) && /mm/i.test(v)) return v;
    return "MM";
  }
  if (/^SM$/i.test(v)) return "SM";
  if (/^MM$/i.test(v)) return "MM";
  return v;
}

function normalizeShielding(raw: string): string {
  const v = collapseSpaces(raw).toLowerCase().replace(/ё/g, "е");
  if (
    v === "нет" ||
    v === "0" ||
    /^неэкранир/.test(v) ||
    v === "utp" ||
    v === "u/utp"
  ) {
    return "Нет";
  }
  if (
    v === "да" ||
    v === "1" ||
    /^экранир/.test(v) ||
    /^(f\/utp|ftp|sftp|sf\/utp|stp)$/i.test(v)
  ) {
    return "Да";
  }
  return collapseSpaces(raw);
}

function normalizeCategory(raw: string): string {
  let v = collapseSpaces(raw);
  v = cyrillicLookalikeToLatin(v).toUpperCase();
  // 5E, 6A, 6, 5, 2…
  const m = v.match(/^(\d)([A-Z])?$/);
  if (m) return m[2] ? `${m[1]}${m[2]}` : m[1];
  return v;
}

function normalizeJacketMaterial(raw: string): string {
  const v = collapseSpaces(raw);
  const codeInParen = v.match(/\(([A-Z0-9]+)\)\s*$/i);
  if (codeInParen) return codeInParen[1].toUpperCase();
  if (/^PVC$/i.test(v) || /^ПВХ$/i.test(v)) return "PVC";
  if (/^LDPE$/i.test(v)) return "LDPE";
  if (/^HDPE$/i.test(v)) return "HDPE";
  if (/^LSZH$/i.test(v) || /^нг/i.test(v)) return v;
  return v;
}

function normalizeIpRating(raw: string): string {
  let v = collapseSpaces(raw);
  v = stripOuterParensContent(v);
  const m = v.match(/^(IP\s*\d{2}[A-Z]?)/i);
  if (m) return m[1].replace(/\s+/g, "").toUpperCase();
  return v;
}

function applyGeneralFormat(raw: string): string {
  let v = String(raw).normalize("NFKC");
  v = replaceSubscripts(v);
  v = v.replace(/\r\n/g, "\n").replace(/[\r\n\t]+/g, " ");
  v = collapseSpaces(v);
  v = stripWrappingQuotes(v);
  v = collapseSpaces(v);

  const asNum = normalizePureNumber(v);
  if (asNum !== null) return asNum;

  // Latin C lookalike in "Cталь"
  if (/^Cталь/i.test(v)) v = `С${v.slice(1)}`;

  return v;
}

function applyNameSpecificRules(nameLower: string, value: string): string {
  if (nameLower === "класс бетона") return normalizeConcreteClass(value);
  if (nameLower === "морозостойкость") return normalizeFrostResistance(value);
  if (nameLower === "водонепроницаемость") return normalizeWaterResistance(value);
  if (nameLower === "тип волокна") return normalizeFiberType(value);
  if (nameLower === "наличие экрана") return normalizeShielding(value);
  if (nameLower === "категория") return normalizeCategory(value);
  if (nameLower === "материал оболочки кабеля") return normalizeJacketMaterial(value);
  if (nameLower.startsWith("герметичность")) return normalizeIpRating(value);

  if (TEMPERATURE_NAMES.has(nameLower)) {
    // Only rewrite clear range-like values; leave prose alone
    if (/[….]|\.\.\./.test(value) || /^-?\d/.test(value)) {
      return normalizeTemperatureRange(value);
    }
  }

  if (TITLE_CASE_ENUM_NAMES.has(nameLower)) {
    // Single-word / short enums only
    if (!/[\/,]/.test(value) && value.length <= 40) {
      return titleCaseWord(value);
    }
  }

  return value;
}

/**
 * Normalize a characteristic value for filters, facets, and product cards.
 * Returns null for empty / junk values that should be dropped.
 */
export function normalizeCharValue(
  name: string | undefined | null,
  value: string | undefined | null,
): string | null {
  if (value == null) return null;
  const raw = String(value);
  if (!raw.trim()) return null;

  if (isColorCharName(name)) {
    return normalizeColorValue(raw);
  }

  const nameLower = (name || "").trim().toLowerCase();
  let v = applyGeneralFormat(raw);
  if (!v) return null;
  v = applyNameSpecificRules(nameLower, v);
  v = collapseSpaces(v);
  return v || null;
}

/** Whether a normalized value is short enough to appear as a facet checkbox. */
export function isFacetableCharValue(value: string): boolean {
  return value.length > 0 && value.length <= MAX_FACET_VALUE_LENGTH;
}
