import * as XLSX from "xlsx";
import iconv from "iconv-lite";
import { parseBynNumber } from "./pricing";

// Ensure the optional codepage tables are loaded for .xls BIFF encodings.
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("codepage");
} catch {
  /* optional */
}

export interface ParsedPriceRow {
  articul: string;
  name: string;
  priceA: number;
  priceB: number | null;
  stock: string;
  descriptionRaw: string;
  sourceUrl: string | null;
  sectionTitle: string;
  vendor: string;
  row: number;
}

export interface ParsedPriceSection {
  title: string;
  vendor: string;
  productCount: number;
}

export interface ParsedPriceBook {
  fetchedAt: string;
  priceDate: string | null;
  products: ParsedPriceRow[];
  sections: ParsedPriceSection[];
  vendors: string[];
}

/** True when text looks like CP1251 bytes misread as Latin-1 (classic mojibake). */
function looksLikeCp1251Mojibake(text: string): boolean {
  if (!text) return false;
  if (/[А-Яа-яЁё]/.test(text)) return false;
  // Typical Microinform mojibake markers for Russian words.
  return /[À-ÿ]{3,}/.test(text) && /[ñîáóäâàåèÿ÷ñòü]/.test(text);
}

function decodeCp1251Mojibake(text: string): string {
  const bytes = Buffer.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
  return iconv.decode(bytes, "win1251");
}

function repairText(text: string): string {
  if (!looksLikeCp1251Mojibake(text)) return text;
  try {
    const fixed = decodeCp1251Mojibake(text);
    if (/[А-Яа-яЁё]/.test(fixed)) return fixed;
  } catch {
    /* keep original */
  }
  return text;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    return String(value);
  }
  return repairText(String(value).replace(/\r?\n/g, " ").trim());
}

function cellNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null || value === "") return null;
  return parseBynNumber(cellText(value));
}

const KNOWN_VENDORS: Array<{ match: RegExp; name: string }> = [
  { match: /origo/i, name: "Origo" },
  { match: /d-?link/i, name: "D-Link" },
  { match: /ruijie/i, name: "Ruijie" },
  { match: /informix|infromix/i, name: "INFORMIX" },
  { match: /\bsvc\b/i, name: "SVC" },
  { match: /systeme/i, name: "Systeme Electric" },
  { match: /moxa/i, name: "MOXA" },
  { match: /\baten\b/i, name: "ATEN" },
  { match: /cisco/i, name: "Cisco" },
  { match: /hikvision|hiwatch/i, name: "Hikvision" },
  { match: /bosch/i, name: "BOSCH" },
  { match: /qnap/i, name: "QNAP" },
  { match: /qsan/i, name: "QSAN" },
  { match: /osnovo/i, name: "OSNOVO" },
  { match: /huawei/i, name: "Huawei" },
  { match: /schneider/i, name: "Schneider Electric" },
  { match: /supermicro/i, name: "Supermicro" },
  { match: /\bapc\b/i, name: "APC" },
  { match: /iflow/i, name: "iFLOW" },
  { match: /iseetec/i, name: "ISEETEC" },
  { match: /\boki\b/i, name: "OKI" },
  { match: /everfocus/i, name: "Everfocus" },
  { match: /maiwe/i, name: "Maiwe" },
  { match: /\bhp\b/i, name: "HP" },
  { match: /energizer/i, name: "ENERGIZER" },
  { match: /epct/i, name: "EPCT" },
  { match: /avonic/i, name: "AVONIC" },
  { match: /garland/i, name: "GARLAND" },
  { match: /gooxi/i, name: "Servers Gooxi" },
];

function detectVendor(title: string, fallback: string): string {
  for (const entry of KNOWN_VENDORS) {
    if (entry.match.test(title)) return entry.name;
  }

  // Keep previous vendor for subcategory rows; do not invent vendors from free-text headers.
  const subcategory =
    /коммутатор|модул|беспровод|кабел|камер|питан|адаптер|маршрутиз|медиа|usb|kvm|антенн|voip|xdsl|сервер|промышлен|неуправл|управляем|настраиваем|монитор|транс|блок|консол|\(\d+\)|wifi|wi-fi|sfp|poe/i.test(
      title,
    );
  if (subcategory) return fallback || "Другое";
  return fallback || "Другое";
}

function isHeaderRow(code: string, priceA: string): boolean {
  return Boolean(code) && !priceA;
}

function extractSourceUrl(description: string): string | null {
  const trimmed = description.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export function parseMicroinformPriceBuffer(
  buffer: Buffer,
  fetchedAt = new Date().toISOString(),
): ParsedPriceBook {
  // Microinform .xls ships with Windows-1251 Cyrillic.
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false, codepage: 1251 });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  let currentSection = "";
  let currentVendor = "";
  let priceDate: string | null = null;
  const products: ParsedPriceRow[] = [];
  const sectionCounts = new Map<string, { vendor: string; count: number }>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] || [];
    const code = cellText(row[0]);
    const name = cellText(row[1]);
    const priceAValue = row[2];
    const priceAText = cellText(priceAValue);
    const priceBValue = row[3];
    const stock = cellText(row[4]);
    const descriptionRaw = cellText(row[5]);
    const rowNumber = i + 1;

    if (i === 4 && /^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(code)) {
      priceDate = code;
    }

    if (code.toLowerCase() === "код товара") continue;

    if (isHeaderRow(code, priceAText)) {
      currentSection = code;
      currentVendor = detectVendor(code, currentVendor);
      if (currentSection && !sectionCounts.has(currentSection)) {
        sectionCounts.set(currentSection, { vendor: currentVendor || "Другое", count: 0 });
      } else if (currentSection && currentVendor) {
        const prev = sectionCounts.get(currentSection);
        if (prev) prev.vendor = currentVendor;
      }
      continue;
    }

    if (!code || priceAValue == null || priceAText === "") continue;
    const priceA = cellNumber(priceAValue);
    if (priceA == null) continue;

    const vendor = currentVendor || detectVendor(currentSection, "Другое");
    const sectionTitle = currentSection || "Без раздела";
    if (!sectionCounts.has(sectionTitle)) {
      sectionCounts.set(sectionTitle, { vendor, count: 0 });
    }
    const bucket = sectionCounts.get(sectionTitle)!;
    bucket.count += 1;
    bucket.vendor = vendor;

    products.push({
      articul: code,
      name: name || code,
      priceA,
      priceB: cellNumber(priceBValue),
      stock,
      descriptionRaw,
      sourceUrl: extractSourceUrl(descriptionRaw),
      sectionTitle,
      vendor,
      row: rowNumber,
    });
  }

  const sections: ParsedPriceSection[] = [...sectionCounts.entries()].map(([title, info]) => ({
    title,
    vendor: info.vendor,
    productCount: info.count,
  }));

  const vendors = [...new Set(products.map((p) => p.vendor).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "ru"),
  );

  return { fetchedAt, priceDate, products, sections, vendors };
}
