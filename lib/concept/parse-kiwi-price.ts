import * as XLSX from "xlsx";
import { isExcludedKiwiProduct } from "./kiwi-filters";

// Ensure optional codepage tables for .xls BIFF encodings.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("codepage");
} catch {
  /* optional */
}

export interface ParsedKiwiRow {
  articul: string;
  name: string;
  usd: number;
  sectionTitle: string;
  vendor: "KIWI";
  row: number;
  descriptionRaw: string;
}

export interface ParsedKiwiSection {
  title: string;
  vendor: "KIWI";
  productCount: number;
}

export interface ParsedKiwiPriceBook {
  fetchedAt: string;
  sourceName: string;
  products: ParsedKiwiRow[];
  sections: ParsedKiwiSection[];
  brands: string[];
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return String(value).replace(/\r\n/g, "\n").trim();
}

function cellNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cellText(value)
    .replace(/\s+/g, "")
    .replace(",", ".")
    .replace(/\$/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isHeaderRow(a: string, b: string, c: unknown): boolean {
  if (!a || b) return false;
  const cText = cellText(c).toLowerCase();
  if (cText.includes("цена") || cText.includes("price")) return true;
  // Category title with empty price column.
  if (!cText && a.length > 3 && !/kiwi|www|email|тел|россия|бизнес|киевск/i.test(a)) {
    return true;
  }
  return false;
}

function isProductRow(a: string, b: string, usd: number | null): boolean {
  if (!a || usd == null || usd <= 0) return false;
  // Skip footer/address blocks.
  if (/www\.|email:|тел\.|россия/i.test(a)) return false;
  return Boolean(b) || /^KIWI/i.test(a);
}

export function parseKiwiPriceBuffer(
  buffer: Buffer,
  sourceName = "KIWI Pricelist.xls",
): ParsedKiwiPriceBook {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return {
      fetchedAt: new Date().toISOString(),
      sourceName,
      products: [],
      sections: [],
      brands: ["KIWI"],
    };
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: true,
  }) as unknown[][];

  let currentSection = "KIWI";
  const products: ParsedKiwiRow[] = [];
  const sectionCounts = new Map<string, number>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const a = cellText(row[0]);
    const b = cellText(row[1]);
    const usd = cellNumber(row[2]);

    if (isHeaderRow(a, b, row[2])) {
      currentSection = a.replace(/\s+/g, " ").trim();
      if (!sectionCounts.has(currentSection)) sectionCounts.set(currentSection, 0);
      continue;
    }

    if (!isProductRow(a, b, usd) || usd == null) continue;

    const articul = a.replace(/\s+/g, " ").trim();
    const name = (b || articul).replace(/\s+/g, " ").trim();
    if (isExcludedKiwiProduct(articul, name)) continue;
    products.push({
      articul,
      name,
      usd,
      sectionTitle: currentSection,
      vendor: "KIWI",
      row: i + 1,
      descriptionRaw: b.includes("\n") ? b : "",
    });
    sectionCounts.set(currentSection, (sectionCounts.get(currentSection) || 0) + 1);
  }

  const sections: ParsedKiwiSection[] = [...sectionCounts.entries()]
    .filter(([, count]) => count > 0)
    .map(([title, productCount]) => ({
      title,
      vendor: "KIWI" as const,
      productCount,
    }));

  return {
    fetchedAt: new Date().toISOString(),
    sourceName,
    products,
    sections,
    brands: ["KIWI"],
  };
}
