import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { normalizeMicroinformArticul, stripDlinkRevisionsFromText } from "./articul";
import { MICROINFORM_DIR } from "./paths";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const INDEX_PATH = path.join(MICROINFORM_DIR, "manufacturer-index.json");

export interface ManufacturerIndexEntry {
  vendor: "D-Link" | "Origo" | "ATEN";
  model: string;
  url: string;
  subtitle: string;
  /** Category-listing packshot (often /up/prod/min/*_prev.jpg angled hero). */
  listingImage?: string;
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
    // Keep official RU distributor (aten.ru) and reseller (atenpro.ru) as-is.
    // Legacy ru.aten.com productItem.php pages stay on that host when present.
    if (host === "ru.aten.com") {
      u.protocol = "https:";
      u.hostname = "ru.aten.com";
      u.hash = "";
      return u.toString();
    }
    u.protocol = "https:";
    u.hostname = host === "aten.ru" ? "aten.ru" : host;
    // Prefer RU locale pages for D-Link.
    if (host === "dlink.ru") {
      u.pathname = u.pathname.replace(/^\/by\//i, "/ru/");
      u.pathname = u.pathname.replace(/^\/en\//i, "/ru/");
    }
    // aten.com /ru/ru/ is often CloudFront-403 from DC IPs; global/en works.
    // Do not rewrite aten.ru / atenpro.ru — those are Russian description sources.
    if (host === "aten.com") {
      u.hash = "";
      u.pathname = u.pathname
        .replace(/^\/ru\/ru\//i, "/global/en/")
        .replace(/^\/us\/en\//i, "/global/en/")
        .replace(/^\/eu\/en\//i, "/global/en/");
      if (u.hostname !== "www.aten.com" && u.hostname === "aten.com") {
        u.hostname = "www.aten.com";
      }
    }
    if (host === "atenpro.ru") {
      u.hostname = "www.atenpro.ru";
    }
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}

type AtenRuSource = "aten.ru" | "atenpro.ru";

let atenRuUrlMapCache: Record<string, string> | null = null;
let atenproUrlMapCache: Record<string, string> | null = null;

function readJsonMap(fileName: string): Record<string, string> {
  const mapPath = path.join(MICROINFORM_DIR, fileName);
  if (!existsSync(mapPath)) return {};
  try {
    const raw = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, string>;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function getAtenRuUrlMap(): Record<string, string> {
  if (!atenRuUrlMapCache) atenRuUrlMapCache = readJsonMap("aten-ru-url-map.json");
  return atenRuUrlMapCache;
}

function getAtenproUrlMap(): Record<string, string> {
  if (!atenproUrlMapCache) atenproUrlMapCache = readJsonMap("atenpro-url-map.json");
  return atenproUrlMapCache;
}

function lookupInUrlMap(map: Record<string, string>, articul: string): string {
  const norm = normalizeMicroinformArticul("ATEN", articul || "").toUpperCase();
  if (!norm) return "";
  const base = norm.split("/")[0] || norm;
  const compact = norm.replace(/-/g, "");
  const baseCompact = base.replace(/-/g, "");
  return map[norm] || map[base] || map[compact] || map[baseCompact] || "";
}

/** Prefer official aten.ru card; fall back to atenpro.ru product page. */
export function lookupAtenRussianUrl(
  articul: string,
): { url: string; source: AtenRuSource } | null {
  const ru = lookupInUrlMap(getAtenRuUrlMap(), articul);
  if (ru) return { url: normalizeManufacturerUrl(ru), source: "aten.ru" };
  const pro = lookupInUrlMap(getAtenproUrlMap(), articul);
  if (pro) return { url: normalizeManufacturerUrl(pro), source: "atenpro.ru" };
  return null;
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

function collectModelKeys(model: string, vendorHint = ""): string[] {
  const raw = model.trim();
  const keys = new Set<string>([raw.toUpperCase()]);
  const vendorForNorm = /^aten$/i.test(vendorHint) ? "ATEN" : "D-Link";
  const noRev = normalizeMicroinformArticul(vendorForNorm, raw).toUpperCase();
  keys.add(noRev);
  keys.add(noRev.split("/")[0] || noRev);
  // Soft licenses / option SKUs → parent hardware model (DXS-3610-54S-SE-LIC → DXS-3610-54S).
  const noLic = noRev.replace(/-(?:SE-)?LIC$/i, "").replace(/-LIC$/i, "");
  if (noLic && noLic !== noRev) {
    keys.add(noLic);
    keys.add(noLic.split("/")[0] || noLic);
  }
  if (/^DEM-/i.test(raw)) keys.add(raw.replace(/^DEM-/i, "").toUpperCase());
  else if (/^\d{3}[A-Z]/i.test(raw) || /^(310|311|330|331|431|433|435|436)/i.test(raw)) {
    keys.add(`DEM-${raw}`.toUpperCase());
  }
  // ATEN URL/model slugs are lowercase without pack suffixes.
  if (/^aten$/i.test(vendorHint) || /^(CS|CL|CE|KE|KH|KA|UC|UE|VE|VM|VS|VC|2L|2X)/i.test(raw)) {
    const aten = normalizeMicroinformArticul("ATEN", raw).toUpperCase();
    keys.add(aten);
    keys.add(aten.split("/")[0] || aten);
    keys.add(aten.replace(/-/g, ""));
  }
  return [...keys];
}

function modelFromAtenUrl(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = decodeURIComponent(parts[parts.length - 1] || "")
      .replace(/\.html?$/i, "")
      .replace(/~.*$/, "");
    if (/^[a-z0-9][a-z0-9._/-]*$/i.test(last) && last.length >= 3) return last.toUpperCase();
  } catch {
    /* ignore */
  }
  return "";
}

async function refreshAtenSitemapMap(): Promise<Record<string, string>> {
  const mapPath = path.join(MICROINFORM_DIR, "aten-url-map.json");
  try {
    const res = await fetch("https://www.aten.com/sitemap.xml", {
      headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]!.trim());
    const map: Record<string, string> = {};
    for (const url of locs) {
      if (!/\/global\/en\/products\/.+\/[a-z0-9][a-z0-9._-]+\/?$/i.test(url)) continue;
      const clean = url.endsWith("/") ? url : `${url}/`;
      const parts = clean.split("/").filter(Boolean);
      const model = (parts[parts.length - 1] || "").toUpperCase();
      if (!model) continue;
      if (!map[model] || clean.length < map[model]!.length) map[model] = clean;
    }
    if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });
    writeFileSync(mapPath, JSON.stringify(map, null, 2), "utf-8");
    return map;
  } catch {
    if (!existsSync(mapPath)) return {};
    try {
      return JSON.parse(readFileSync(mapPath, "utf-8")) as Record<string, string>;
    } catch {
      return {};
    }
  }
}

function readAtenSitemapMap(): Record<string, string> {
  const mapPath = path.join(MICROINFORM_DIR, "aten-url-map.json");
  if (!existsSync(mapPath)) return {};
  try {
    return JSON.parse(readFileSync(mapPath, "utf-8")) as Record<string, string>;
  } catch {
    return {};
  }
}

function isModernAtenProductUrl(url: string): boolean {
  return /\/global\/en\/products\/.+\//i.test(url) && !/%[0-9A-F]{2}/i.test(url) && !/productItem\.php/i.test(url);
}

function buildAtenIndexFromPrice(): ManufacturerIndexEntry[] {
  const parsedPath = path.join(MICROINFORM_DIR, "price-parsed.json");
  const sitemap = readAtenSitemapMap();
  const byModel = new Map<string, ManufacturerIndexEntry>();

  const upsert = (model: string, url: string, subtitle: string) => {
    const key = model.toUpperCase();
    if (!key || !url) return;
    const normalizedUrl = normalizeManufacturerUrl(url);
    if (!normalizedUrl) return;
    const prev = byModel.get(key);
    const prefer = isModernAtenProductUrl(normalizedUrl);
    const prevPrefer = prev ? isModernAtenProductUrl(prev.url) : false;
    if (!prev || (prefer && !prevPrefer) || (prefer === prevPrefer && normalizedUrl.length < (prev?.url.length || 9999))) {
      byModel.set(key, {
        vendor: "ATEN",
        model: key,
        url: normalizedUrl,
        subtitle,
      });
    }
  };

  for (const [model, url] of Object.entries(sitemap)) {
    upsert(model, url, "");
  }

  if (existsSync(parsedPath)) {
    try {
      const book = JSON.parse(readFileSync(parsedPath, "utf-8")) as {
        products?: Array<{
          vendor?: string;
          articul?: string;
          name?: string;
          sourceUrl?: string;
        }>;
      };
      for (const row of book.products || []) {
        if (!/^aten$/i.test(row.vendor || "")) continue;
        const model = normalizeMicroinformArticul("ATEN", row.articul || "");
        if (!model) continue;
        const subtitle = cleanText(String(row.name || "").replace(/^ATEN\s+/i, ""));
        const sitemapUrl = sitemap[model.toUpperCase()] || sitemap[model.toUpperCase().split("/")[0] || ""];
        if (sitemapUrl) {
          upsert(model, sitemapUrl, subtitle);
          continue;
        }
        const rawUrl = String(row.sourceUrl || "").trim();
        if (!rawUrl || !/^https?:\/\//i.test(rawUrl) || /^https?:\/\/ru\/?$/i.test(rawUrl)) continue;
        upsert(model, rawUrl, subtitle);
      }
    } catch {
      /* ignore broken price cache */
    }
  }

  return [...byModel.values()];
}

/** dlink.ru /ru/products/{id}/ — only categories that list `.product` cards. */
const DLINK_CATEGORY_IDS = [
  1, // Коммутаторы (+ часть трансиверов/БП в листинге)
  2, // Оборудование Wi-Fi (+ часть камер/GPON)
  3, // Устройства xDSL
  4, // Медиаконвертеры
  5, // Маршрутизаторы
  6, // Межсетевые экраны
  7, // Сетевые адаптеры
  8, // Устройства VoIP
  9, // Принт-серверы
  10, // Переключатели KVM
  11, // Кабельный модем
  14, // Мультимедиа
  16, // PowerLine
] as const;

/** Origo listing ids that currently expose `.model_name` cards (not contiguous). */
const ORIGO_CATEGORY_IDS = [
  1, 8, 9, 10, 13, 15, 19, 21, 25, 28, 33, 35, 40, 50,
] as const;

async function scrapeDlinkCategories(): Promise<ManufacturerIndexEntry[]> {
  const entries: ManufacturerIndexEntry[] = [];
  for (const cat of DLINK_CATEGORY_IDS) {
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
      const imgSrc =
        root.find("img").first().attr("src") ||
        root.find("img").first().attr("data-src") ||
        "";
      let listingImage: string | undefined;
      if (imgSrc) {
        try {
          listingImage = normalizeManufacturerUrl(new URL(imgSrc, listUrl).toString());
        } catch {
          listingImage = undefined;
        }
      }
      entries.push({
        vendor: "D-Link",
        model,
        url: abs,
        subtitle,
        ...(listingImage ? { listingImage } : {}),
      });
    });
  }
  return entries;
}

async function scrapeOrigoCategories(): Promise<ManufacturerIndexEntry[]> {
  const entries: ManufacturerIndexEntry[] = [];
  for (const cat of ORIGO_CATEGORY_IDS) {
    const listUrl = `https://origo-networks.ru/products/${cat}/`;
    let html = "";
    try {
      html = await fetchText(listUrl);
    } catch {
      continue;
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
  }
  return entries;
}

export async function buildManufacturerIndex(): Promise<ManufacturerIndex> {
  const [dlink, origo] = await Promise.all([scrapeDlinkCategories(), scrapeOrigoCategories()]);
  await refreshAtenSitemapMap();
  const aten = buildAtenIndexFromPrice();
  const index: ManufacturerIndex = {
    builtAt: new Date().toISOString(),
    entries: [...dlink, ...origo, ...aten],
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
    for (const key of collectModelKeys(entry.model, entry.vendor)) addIndexAlias(map, key, entry);
  }
  return map;
}

function normalizeVendorName(vendor: string): "D-Link" | "Origo" | "ATEN" | "" {
  if (/^d-?link$/i.test(vendor)) return "D-Link";
  if (/^origo$/i.test(vendor)) return "Origo";
  if (/^aten$/i.test(vendor)) return "ATEN";
  return "";
}

export function lookupManufacturerEntry(
  index: ManufacturerIndex,
  vendor: string,
  articul: string,
): ManufacturerIndexEntry | null {
  const map = indexLookupMap(index);
  const vendorNorm = normalizeVendorName(vendor);
  if (!vendorNorm) return null;
  const normalized = normalizeMicroinformArticul(vendor, articul);
  const candidates = collectModelKeys(normalized, vendorNorm);
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

/** Follow D-Link "Рекомендованная замена" when the open card is an old EOL revision. */
export function extractDlinkReplacementUrl(pageUrl: string, html: string): string | null {
  const $ = cheerio.load(html);
  let found: string | null = null;
  $("a[href*='/products/']").each((_, el) => {
    if (found) return;
    const $a = $(el);
    const ctx = cleanText(`${$a.text()} ${$a.parent().text()} ${$a.closest("table, p, div").text()}`);
    if (!/рекомендованная\s+замена/i.test(ctx)) return;
    const href = $a.attr("href");
    if (!href) return;
    try {
      found = normalizeManufacturerUrl(new URL(href, pageUrl).toString());
    } catch {
      /* ignore */
    }
  });
  return found;
}

export function isDlinkObsoleteProductPage(html: string): boolean {
  const text = cleanText(cheerio.load(html)("h2, h3, .product-description, title, body").first().text() || "");
  const full = cleanText(cheerio.load(html)("body").text());
  return (
    /\bEOL\b/i.test(text) ||
    /\bEOS\b/i.test(text) ||
    /рекомендованная\s+замена/i.test(full)
  );
}

export function extractManufacturerPageInfo(
  pageUrl: string,
  html: string,
  vendor: string,
  articul: string,
): ManufacturerPageInfo | null {
  const $ = cheerio.load(html);
  const brand = normalizeVendorName(vendor) || vendor;
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
  } else if (brand === "ATEN") {
    model =
      cleanText($("h1").first().text()) ||
      cleanText($(".product-name, .productTitle, .model-name").first().text()) ||
      modelFromAtenUrl(pageUrl) ||
      "";
    // Title often "CS22H | Cable KVM Switch | ATEN ..."
    const title = cleanText($("title").text());
    if (!model && title) model = title.split("|")[0]?.trim() || "";
    subtitle =
      cleanText($("h1 + p, .product-brief, .product-desc, .hero-desc, meta[name='description']").first().text()) ||
      cleanText($("meta[property='og:description']").attr("content") || "") ||
      (title.includes("|") ? cleanText(title.split("|").slice(1, -1).join("|")) : "");
    if (subtitle.toUpperCase().startsWith(model.toUpperCase())) {
      subtitle = subtitle.replace(new RegExp(`^${model}\\s*[–—:|/-]\\s*`, "i"), "").trim();
    }
  }

  model = stripDlinkRevisionsFromText(model);
  subtitle = stripDlinkRevisionsFromText(subtitle);

  if (!model) model = normalized.split("/")[0] || normalized;
  if (!subtitle) {
    if (brand === "ATEN") subtitle = model;
    else return null;
  }

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

function urlKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function modelMatchesArticul(
  vendor: string,
  articul: string,
  pageModel: string,
): boolean {
  return collectModelKeys(articul)
    .concat(collectModelKeys(normalizeMicroinformArticul(vendor, articul)))
    .some((k) => {
      const keys = collectModelKeys(pageModel);
      return keys.includes(k.toUpperCase()) || pageModel.toUpperCase().includes(k.toUpperCase());
    });
}

export async function resolveManufacturerPage(
  vendor: string,
  articul: string,
  currentUrl: string | null | undefined,
  index: ManufacturerIndex,
): Promise<{
  url: string | null;
  source: "current" | "index" | "replacement" | "none";
  entry: ManufacturerIndexEntry | null;
  currentMatches: boolean;
}> {
  const entry = lookupManufacturerEntry(index, vendor, articul);
  const rewritten = currentUrl ? normalizeManufacturerUrl(currentUrl) : "";

  // Category index is the current product card. Prefer it over stale EOL revision URLs
  // that still match the model name (e.g. DGS-1008A/B → DGS-1008A).
  if (entry?.url) {
    const indexUrl = normalizeManufacturerUrl(entry.url);
    const currentMatches = Boolean(rewritten && urlKey(rewritten) === urlKey(indexUrl));
    return { url: indexUrl, source: "index", entry, currentMatches };
  }

  if (rewritten) {
    try {
      const html = await fetchText(rewritten);
      const info = extractManufacturerPageInfo(rewritten, html, vendor, articul);
      const modelOk = Boolean(info && modelMatchesArticul(vendor, articul, info.model));

      if (modelOk && isDlinkObsoleteProductPage(html)) {
        const replacement = extractDlinkReplacementUrl(rewritten, html);
        if (replacement && urlKey(replacement) !== urlKey(rewritten)) {
          try {
            const replHtml = await fetchText(replacement);
            const replInfo = extractManufacturerPageInfo(replacement, replHtml, vendor, articul);
            if (replInfo && modelMatchesArticul(vendor, articul, replInfo.model)) {
              return {
                url: replacement,
                source: "replacement",
                entry: null,
                currentMatches: false,
              };
            }
          } catch {
            /* keep current if replacement fetch fails */
          }
        }
      }

      if (modelOk) {
        return { url: rewritten, source: "current", entry: null, currentMatches: true };
      }
    } catch {
      // ATEN often blocks datacenter IPs; keep a plausible product URL for later enrich.
      if (/^aten$/i.test(vendor) && /aten\.com|aten\.ru/i.test(rewritten)) {
        return { url: rewritten, source: "current", entry: null, currentMatches: true };
      }
    }
  }

  return { url: null, source: "none", entry: null, currentMatches: false };
}
