import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { normalizeMicroinformArticul, stripDlinkRevisionsFromText } from "./articul";
import { MICROINFORM_DIR } from "./paths";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const INDEX_PATH = path.join(MICROINFORM_DIR, "manufacturer-index.json");

export interface ManufacturerIndexEntry {
  vendor: "D-Link" | "Origo";
  model: string;
  url: string;
  subtitle: string;
}

export interface ManufacturerIndex {
  builtAt: string;
  entries: ManufacturerIndexEntry[];
}

export interface ManufacturerPageInfo {
  url: string;
  model: string;
  subtitle: string;
  displayName: string;
}

function cleanText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeManufacturerUrl(url: string): string {
  if (!url?.trim()) return "";
  try {
    const u = new URL(url.trim());
    let host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (host === "d-link.ru" || host === "dlink.by") host = "dlink.ru";
    if (host === "origo-networks.ru" || host === "www.origo-networks.ru") host = "origo-networks.ru";
    u.protocol = "https:";
    u.hostname = host;
    // Prefer RU locale pages for D-Link.
    if (host === "dlink.ru") {
      u.pathname = u.pathname.replace(/^\/by\//i, "/ru/");
      u.pathname = u.pathname.replace(/^\/en\//i, "/ru/");
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function addIndexAlias(
  map: Map<string, ManufacturerIndexEntry>,
  key: string,
  entry: ManufacturerIndexEntry,
): void {
  const k = key.toUpperCase().trim();
  if (!k) return;
  const prev = map.get(k);
  if (!prev) {
    map.set(k, entry);
    return;
  }
  // Prefer richer subtitle / longer stable URL.
  if ((entry.subtitle?.length || 0) > (prev.subtitle?.length || 0)) map.set(k, entry);
}

function collectModelKeys(model: string): string[] {
  const raw = model.trim();
  const keys = new Set<string>([raw.toUpperCase()]);
  const noRev = normalizeMicroinformArticul("D-Link", raw).toUpperCase();
  keys.add(noRev);
  keys.add(noRev.split("/")[0] || noRev);
  if (/^DEM-/i.test(raw)) keys.add(raw.replace(/^DEM-/i, "").toUpperCase());
  else if (/^\d{3}[A-Z]/i.test(raw) || /^(310|311|330|331|431|433|435|436)/i.test(raw)) {
    keys.add(`DEM-${raw}`.toUpperCase());
  }
  return [...keys];
}

async function scrapeDlinkCategories(): Promise<ManufacturerIndexEntry[]> {
  const entries: ManufacturerIndexEntry[] = [];
  for (let cat = 1; cat <= 7; cat++) {
    const listUrl = `https://dlink.ru/ru/products/${cat}/`;
    let html = "";
    try {
      html = await fetchText(listUrl);
    } catch {
      continue;
    }
    const $ = cheerio.load(html);
    $(".product").each((_, el) => {
      const root = $(el);
      const href = root.find("a[href*='/products/']").first().attr("href") || "";
      const model = cleanText(root.find("h4.name, .name").first().text());
      const subtitle = cleanText(root.find("p.description, .description").first().text());
      if (!href || !model) return;
      const abs = normalizeManufacturerUrl(new URL(href, listUrl).toString());
      entries.push({ vendor: "D-Link", model, url: abs, subtitle });
    });
  }
  return entries;
}

async function scrapeOrigoCategories(): Promise<ManufacturerIndexEntry[]> {
  const entries: ManufacturerIndexEntry[] = [];
  const listUrl = "https://origo-networks.ru/products/1/";
  let html = "";
  try {
    html = await fetchText(listUrl);
  } catch {
    return entries;
  }
  const $ = cheerio.load(html);
  $("a[href*='/products/']").each((_, el) => {
    const root = $(el);
    const href = root.attr("href") || "";
    const model = cleanText(root.find(".model_name").first().text());
    const subtitle = cleanText(root.find(".model_title, h3.model_title").first().text());
    if (!href || !model) return;
    if (!/\/products\/\d+\/\d+\.html/i.test(href)) return;
    const abs = normalizeManufacturerUrl(new URL(href, listUrl).toString());
    entries.push({ vendor: "Origo", model, url: abs, subtitle });
  });
  return entries;
}

export async function buildManufacturerIndex(): Promise<ManufacturerIndex> {
  const [dlink, origo] = await Promise.all([scrapeDlinkCategories(), scrapeOrigoCategories()]);
  const index: ManufacturerIndex = {
    builtAt: new Date().toISOString(),
    entries: [...dlink, ...origo],
  };
  if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2), "utf-8");
  return index;
}

export function readManufacturerIndex(): ManufacturerIndex | null {
  if (!existsSync(INDEX_PATH)) return null;
  try {
    return JSON.parse(readFileSync(INDEX_PATH, "utf-8")) as ManufacturerIndex;
  } catch {
    return null;
  }
}

export async function getManufacturerIndex(options?: {
  rebuild?: boolean;
  maxAgeMs?: number;
}): Promise<ManufacturerIndex> {
  const maxAgeMs = options?.maxAgeMs ?? 12 * 60 * 60 * 1000;
  const existing = readManufacturerIndex();
  if (!options?.rebuild && existing?.builtAt) {
    const age = Date.now() - new Date(existing.builtAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < maxAgeMs && existing.entries?.length) {
      return existing;
    }
  }
  return buildManufacturerIndex();
}

function indexLookupMap(index: ManufacturerIndex): Map<string, ManufacturerIndexEntry> {
  const map = new Map<string, ManufacturerIndexEntry>();
  for (const entry of index.entries) {
    for (const key of collectModelKeys(entry.model)) addIndexAlias(map, key, entry);
  }
  return map;
}

export function lookupManufacturerEntry(
  index: ManufacturerIndex,
  vendor: string,
  articul: string,
): ManufacturerIndexEntry | null {
  const map = indexLookupMap(index);
  const vendorNorm = /^d-?link$/i.test(vendor) ? "D-Link" : /^origo$/i.test(vendor) ? "Origo" : "";
  if (!vendorNorm) return null;
  const normalized = normalizeMicroinformArticul(vendor, articul);
  const candidates = collectModelKeys(normalized);
  for (const key of candidates) {
    const hit = map.get(key.toUpperCase());
    if (hit && hit.vendor === vendorNorm) return hit;
  }
  // Soft contains fallback for long optic names.
  const base = (normalized.split("/")[0] || normalized).toUpperCase();
  if (base.length >= 4) {
    for (const entry of index.entries) {
      if (entry.vendor !== vendorNorm) continue;
      const model = entry.model.toUpperCase();
      if (model === base || model.endsWith(`-${base}`) || model.includes(base)) return entry;
    }
  }
  return null;
}

export function extractManufacturerPageInfo(
  pageUrl: string,
  html: string,
  vendor: string,
  articul: string,
): ManufacturerPageInfo | null {
  const $ = cheerio.load(html);
  const brand = /^d-?link$/i.test(vendor) ? "D-Link" : /^origo$/i.test(vendor) ? "Origo" : vendor;
  const normalized = normalizeMicroinformArticul(vendor, articul);

  let model = "";
  let subtitle = "";

  if (brand === "D-Link") {
    model = cleanText($(".product-description h3, .product-description h2, h2").first().text()) ||
      cleanText($("title").text()).replace(/^D-Link\s+/i, "").split(/\s+/)[0] ||
      "";
    subtitle = cleanText($(".product-description .description").first().text());
  } else if (brand === "Origo") {
    model = cleanText($("h1").first().text()) || cleanText($(".model_name").first().text());
    const h4 = cleanText($("#section1 h4, .sub-content-block h4, h4").first().text());
    subtitle = h4 || cleanText($(".model_title").first().text());
    // Origo lead often is "OS1108 – коммутатор..."
    if (subtitle.toUpperCase().startsWith(model.toUpperCase())) {
      subtitle = subtitle.replace(new RegExp(`^${model}\\s*[–—:-]\\s*`, "i"), "").trim();
    }
  }

  if (!model) model = normalized.split("/")[0] || normalized;
  if (!subtitle) return null;

  const displayName = buildManufacturerDisplayName(brand, model, subtitle);
  return {
    url: normalizeManufacturerUrl(pageUrl),
    model,
    subtitle,
    displayName,
  };
}

export function buildManufacturerDisplayName(
  brand: string,
  model: string,
  subtitle: string,
): string {
  const cleanModel = stripDlinkRevisionsFromText(model);
  let cleanSubtitle = stripDlinkRevisionsFromText(cleanText(subtitle));
  // Avoid "DGS-1008P DGS-1008P, ..." duplication.
  cleanSubtitle = cleanSubtitle
    .replace(new RegExp(`^${cleanModel}\\s*[–—:,-]\\s*`, "i"), "")
    .replace(new RegExp(`^${brand}\\s+${cleanModel}\\s*[–—:,-]?\\s*`, "i"), "")
    .trim();
  if (!cleanSubtitle) return `${brand} ${cleanModel}`;
  // If subtitle already starts with a product type word, keep manufacturer wording.
  return `${brand} ${cleanModel}, ${cleanSubtitle}`;
}

export async function resolveManufacturerPage(
  vendor: string,
  articul: string,
  currentUrl: string | null | undefined,
  index: ManufacturerIndex,
): Promise<{
  url: string | null;
  source: "current" | "index" | "none";
  entry: ManufacturerIndexEntry | null;
  currentMatches: boolean;
}> {
  const entry = lookupManufacturerEntry(index, vendor, articul);
  const rewritten = currentUrl ? normalizeManufacturerUrl(currentUrl) : "";

  if (rewritten) {
    try {
      const html = await fetchText(rewritten);
      const info = extractManufacturerPageInfo(rewritten, html, vendor, articul);
      const modelOk = Boolean(
        info &&
          collectModelKeys(articul)
            .concat(collectModelKeys(normalizeMicroinformArticul(vendor, articul)))
            .some((k) => {
              const keys = collectModelKeys(info.model);
              return keys.includes(k.toUpperCase()) || info.model.toUpperCase().includes(k.toUpperCase());
            }),
      );
      if (modelOk) {
        return { url: rewritten, source: "current", entry, currentMatches: true };
      }
    } catch {
      /* try index */
    }
  }

  if (entry?.url) {
    return { url: entry.url, source: "index", entry, currentMatches: false };
  }

  return { url: null, source: "none", entry: null, currentMatches: false };
}
