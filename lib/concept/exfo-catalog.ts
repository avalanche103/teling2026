import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import * as cheerio from "cheerio";
import type { ProductRaw } from "@/lib/types";
import { fetchTextWithCurlFallback } from "@/lib/microinform/http-fetch";
import { isConceptOwnedBrand } from "./blocked-brands";
import { CONCEPT_DIR, EXFO_CACHE_PATH } from "./paths";
import { readConceptProducts, readSsdProducts } from "./store";
import { defaultSectionIdForExfo } from "./section-hints";

export type ExfoSource =
  | "exforus"
  | "ctt"
  | "ssd"
  | "concept"
  | "alfaconnect"
  | "merged";

export interface ExfoCatalogItem {
  articul: string;
  name: string;
  url: string;
  sectionTitle: string;
  description?: string;
  pictures?: string[];
  supplierSku?: string;
  source: ExfoSource;
}

export interface ExfoCatalogCache {
  fetchedAt: string;
  items: ExfoCatalogItem[];
  sources: string[];
  warnings?: string[];
  addedSincePrevious?: number;
  updatedSincePrevious?: number;
}

const EXFORUS_HOST = "https://exforus.ru";
const EXFORUS_ROOT = `${EXFORUS_HOST}/product/`;
const CTT_SITEMAP_INDEX = "https://c-tt.shop/sitemap.xml";
const CTT_PRODUCT_HOST = "https://c-tt.shop";
const ALFA_BRAND_URL = "https://www.alfaconnect.by/info/brands/exfo/";

const SOURCE_RANK: Record<ExfoSource, number> = {
  exforus: 5,
  concept: 4,
  ssd: 3,
  merged: 2,
  ctt: 1,
  alfaconnect: 0,
};

/** Prefer full model tokens: FTB Lite 750C, FTBx-720D, MAX-730C, FIP-420B, PX1-PRO… */
const MODEL_RE =
  /\b((?:FTB\s*Lite[-\s]?\d{0,4}[A-Z]?|FTBx?-\d{1,4}[A-Z0-9-]*|MAX(?:Tester)?[-\s]?\d{0,4}[A-Z0-9-]*|FIP-\d{2,4}[A-Z]?|PX1(?:-PRO)?(?:-[A-Z0-9]+)*|AXS[-\s]?[A-Z0-9-]+|FLS[-\s]?[A-Z0-9-]+|OLS[-\s]?[A-Z0-9-]+|OPM[-\s]?[A-Z0-9-]+|FOAS?[-\s]?[A-Z0-9-]+|EUI[-\s]?[A-Z0-9-]+|GP[-\s]?\d{2,5}[A-Z0-9-]*|OX\d+|OLM[-\s]?[A-Z0-9-]*)\b)/i;

function ensureDir(): void {
  if (!existsSync(CONCEPT_DIR)) mkdirSync(CONCEPT_DIR, { recursive: true });
}

function isInternalSupplierSku(value: string): boolean {
  return /^0\d{1,2}-\d{5,}$/i.test(value.trim());
}

/** Normalize model token used as product identity. */
export function normalizeModelKey(articul: string): string {
  return String(articul || "")
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-")
    .toUpperCase();
}

export function extractArticulFromName(name: string): string {
  const cleaned = name.replace(/\s+/g, " ").trim();
  const model = cleaned.match(MODEL_RE)?.[1] || "";
  if (model) {
    return model.replace(/\s+/g, "-").replace(/-+/g, "-").toUpperCase();
  }
  const exfo = cleaned.match(/\b(EXFO[-\s]?[A-Z0-9-]{2,40})\b/i)?.[1];
  if (exfo) return exfo.replace(/\s+/g, "-").toUpperCase();
  return cleaned.slice(0, 80).replace(/\s+/g, "-").toUpperCase();
}

/** Prefer explicit Арт. when it looks like a model; never keep c-tt 01- codes as key. */
export function resolveModelArticul(
  name: string,
  preferred?: string | null,
): { articul: string; supplierSku?: string } {
  const preferredClean = String(preferred || "")
    .replace(/\s+/g, " ")
    .trim();
  if (preferredClean && !isInternalSupplierSku(preferredClean)) {
    const fromPreferred = preferredClean.match(MODEL_RE)?.[1] || preferredClean;
    return {
      articul: fromPreferred.replace(/\s+/g, "-").replace(/-+/g, "-").toUpperCase(),
    };
  }
  const fromName = extractArticulFromName(name);
  return {
    articul: fromName,
    supplierSku: preferredClean && isInternalSupplierSku(preferredClean) ? preferredClean : undefined,
  };
}

function normalizeItemKey(articul: string): string {
  return normalizeModelKey(articul);
}

function productToItem(p: ProductRaw, source: "ssd" | "concept"): ExfoCatalogItem {
  const name = (p.custom_name || p.name || "").trim();
  const preferred = p.metadata?.articul || "";
  const { articul, supplierSku } = resolveModelArticul(name, preferred);
  return {
    articul: articul || preferred || p.sku || `EXFO-${p.id}`,
    name: name || articul,
    url: p.metadata?.url || "",
    sectionTitle: p.section_name || "EXFO",
    description: p.metadata?.description || "",
    pictures: Array.isArray(p.metadata?.pictures) ? [...p.metadata.pictures] : [],
    supplierSku,
    source,
  };
}

function seedFromSsd(): ExfoCatalogItem[] {
  const products = readSsdProducts().filter((p) =>
    isConceptOwnedBrand(p.vendor, p.metadata?.brand, p.name),
  );
  const exfo = products.filter((p) => {
    const brand = (p.metadata?.brand || p.vendor || "").toUpperCase();
    return brand.includes("EXFO") || /\bEXFO\b/i.test(p.name || "");
  });
  return exfo.map((p) => productToItem(p, "ssd"));
}

function seedFromConcept(): ExfoCatalogItem[] {
  const products = readConceptProducts().filter((p) => {
    const brand = (p.metadata?.brand || p.vendor || "").toUpperCase();
    return brand.includes("EXFO") || /\bEXFO\b/i.test(p.name || "");
  });
  return products.map((p) => productToItem(p, "concept"));
}

/** Prefer SSD; if brand already purged from SSD, keep current Concept EXFO. */
function seedLocalExfo(): { items: ExfoCatalogItem[]; source: string } {
  const ssd = seedFromSsd();
  if (ssd.length) return { items: ssd, source: "ssd" };
  const concept = seedFromConcept();
  return { items: concept, source: "concept" };
}

async function fetchText(url: string): Promise<string> {
  try {
    return await fetchTextWithCurlFallback(url);
  } catch {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(60000),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  }
}

function absExforus(href: string): string | null {
  try {
    return new URL(href, EXFORUS_HOST).toString().split("#")[0].split("?")[0];
  } catch {
    return null;
  }
}

function productPathParts(url: string): string[] {
  try {
    return new URL(url).pathname.split("/").filter(Boolean);
  } catch {
    return [];
  }
}

function isExforusCategoryUrl(url: string): boolean {
  const parts = productPathParts(url);
  if (parts[0] !== "product") return false;
  if (parts.length < 2 || parts.length > 3) return false;
  if (/compare|index\.php|filter|sort/i.test(url)) return false;
  return true;
}

function isExforusProductUrl(url: string): boolean {
  const parts = productPathParts(url);
  if (parts[0] !== "product") return false;
  if (parts.length < 4) return false;
  if (/compare|index\.php|filter|sort|apply/i.test(url)) return false;
  return true;
}

function collectExforusLinks(html: string): { categories: string[]; products: string[] } {
  const $ = cheerio.load(html);
  const categories = new Set<string>();
  const products = new Set<string>();
  $("a[href*='/product/']").each((_, el) => {
    const abs = absExforus($(el).attr("href") || "");
    if (!abs || !/^https?:\/\/exforus\.ru\/product\//i.test(abs)) return;
    if (isExforusProductUrl(abs)) products.add(abs);
    else if (isExforusCategoryUrl(abs)) categories.add(abs);
  });
  return { categories: [...categories], products: [...products] };
}

function parseExforusProductPage(url: string, html: string): ExfoCatalogItem | null {
  const $ = cheerio.load(html);
  const name =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $('meta[property="og:title"]').attr("content")?.replace(/\s+/g, " ").trim() ||
    "";
  if (!name) return null;

  let artHint = "";
  const detailText = $(".catalog-detail, .js-popup-block").first().text().replace(/\s+/g, " ");
  const artMatch = detailText.match(/Арт\.\s*([A-Z0-9][A-Z0-9 \-]{1,50})/i);
  if (artMatch?.[1]) artHint = artMatch[1].trim();
  if (!artHint) {
    const bodyArt = $("body").text().replace(/\s+/g, " ").match(/Арт\.\s*([A-Z0-9][A-Z0-9 \-]{1,50})/i);
    if (bodyArt?.[1]) artHint = bodyArt[1].trim();
  }

  const { articul, supplierSku } = resolveModelArticul(name, artHint);

  const descHtml =
    $("#desc").html() ||
    $(".catalog-detail__previewtext").html() ||
    $(".ordered-block").first().html() ||
    "";
  const description = cheerio
    .load(`<div>${descHtml}</div>`)("div")
    .text()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  const pictures: string[] = [];
  $("img").each((_, el) => {
    const src =
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src") ||
      $(el).attr("src") ||
      "";
    if (!src || src.startsWith("data:")) return;
    if (/logo|icon|favicon|sprite|svg|pixel|service_|nonmanufac|wrl7eqs9/i.test(src)) return;
    if (!/\/upload\/iblock\//i.test(src)) return;
    if (/\/\d{2}_\d{2}_\d+\//i.test(src) || /\/90_60_/i.test(src) || /\/50_50_/i.test(src)) return;
    try {
      pictures.push(new URL(src, url).toString());
    } catch {
      /* skip */
    }
  });

  return {
    articul,
    name: /exfo/i.test(name) ? name : `EXFO ${name}`,
    url,
    sectionTitle: "EXFO",
    description,
    pictures: [...new Set(pictures)].slice(0, 8),
    supplierSku,
    source: "exforus",
  };
}

async function scrapeExforusExfo(): Promise<{ items: ExfoCatalogItem[]; warning?: string }> {
  const categoryUrls = new Set<string>([
    `${EXFORUS_HOST}/product/polevoe-oborudovanie/`,
    `${EXFORUS_HOST}/product/laboratornoe-oborudovanie/`,
    `${EXFORUS_HOST}/product/aksessuary/`,
    `${EXFORUS_HOST}/product/snyato-s-proizvodstva/`,
  ]);
  const productUrls = new Set<string>();

  try {
    const rootHtml = await fetchText(EXFORUS_ROOT);
    const root = collectExforusLinks(rootHtml);
    for (const c of root.categories) categoryUrls.add(c);
    for (const p of root.products) productUrls.add(p);
  } catch (error) {
    return {
      items: [],
      warning: `exforus.ru недоступен: ${error instanceof Error ? error.message : "error"}`,
    };
  }

  for (const catUrl of [...categoryUrls].slice(0, 80)) {
    try {
      const html = await fetchText(catUrl);
      const found = collectExforusLinks(html);
      for (const c of found.categories) categoryUrls.add(c);
      for (const p of found.products) productUrls.add(p);
    } catch {
      /* skip category */
    }
  }

  if (!productUrls.size) {
    return { items: [], warning: "exforus.ru: 0 product URLs after crawl" };
  }

  const items: ExfoCatalogItem[] = [];
  for (const url of [...productUrls].slice(0, 400)) {
    try {
      const html = await fetchText(url);
      const item = parseExforusProductPage(url, html);
      if (item) items.push(item);
    } catch {
      /* skip product */
    }
  }

  if (!items.length) {
    return {
      items: [],
      warning: `exforus.ru: найдено ${productUrls.size} URL, но 0 распарсено`,
    };
  }
  return { items };
}

function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim());
}

async function discoverCttExfoProductUrls(): Promise<string[]> {
  const urls = new Set<string>();
  try {
    const indexXml = await fetchText(CTT_SITEMAP_INDEX);
    const childMaps = parseSitemapLocs(indexXml).filter((u) => /sitemap/i.test(u));
    for (const mapUrl of childMaps.slice(0, 12)) {
      try {
        const xml = await fetchText(mapUrl);
        for (const loc of parseSitemapLocs(xml)) {
          if (/\/product\//i.test(loc) && /exfo/i.test(loc)) urls.add(loc);
        }
      } catch {
        /* try next sitemap */
      }
    }
  } catch {
    /* sitemap unavailable */
  }

  const listingUrls = [
    `${CTT_PRODUCT_HOST}/catalog/izmeritelnoe_oborudovanie/`,
    `${CTT_PRODUCT_HOST}/catalog/izmeritelnoe_oborudovanie/?PAGEN_1=1`,
    `${CTT_PRODUCT_HOST}/catalog/izmeritelnoe_oborudovanie/?PAGEN_1=2`,
    `${CTT_PRODUCT_HOST}/catalog/izmeritelnoe_oborudovanie/?PAGEN_1=3`,
  ];
  for (const listUrl of listingUrls) {
    try {
      const html = await fetchText(listUrl);
      const $ = cheerio.load(html);
      $("a[href*='/product/']").each((_, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text() || "";
        if (!/exfo/i.test(href) && !/exfo/i.test(text)) return;
        try {
          urls.add(new URL(href, CTT_PRODUCT_HOST).toString());
        } catch {
          /* skip */
        }
      });
    } catch {
      /* listing unavailable */
    }
  }

  return [...urls];
}

function parseCttProductPage(url: string, html: string): ExfoCatalogItem | null {
  const $ = cheerio.load(html);
  const name =
    $("h1").first().text().replace(/\s+/g, " ").trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";
  if (!name || !/exfo/i.test(name + url)) return null;

  let supplierHint = "";
  $("table tr, .product-item-detail-properties tr, dl, .bx-catalog").each((_, el) => {
    const rowText = $(el).text().replace(/\s+/g, " ").trim();
    const artMatch = rowText.match(/(?:артикул|код-позиции|код позиции)\s*:?\s*([A-Z0-9._/-]+)/i);
    if (artMatch?.[1] && !supplierHint) supplierHint = artMatch[1].trim();
  });
  if (!supplierHint) {
    const metaArt = $('td:contains("Артикул"), th:contains("Артикул")').next().text().trim();
    if (metaArt) supplierHint = metaArt;
  }

  const { articul, supplierSku } = resolveModelArticul(name, supplierHint);

  const description =
    $(".product-item-detail-tab-content, .detail_text, [itemprop='description']")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 4000) || "";

  const pictures: string[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || "";
    if (!src || /logo|icon|favicon|svg/i.test(src)) return;
    if (!/upload|product|iblock/i.test(src)) return;
    if (/resize_cache/i.test(src) && /_\d{2,3}_\d{2,3}_/i.test(src)) return;
    try {
      pictures.push(new URL(src, url).toString());
    } catch {
      /* skip */
    }
  });

  return {
    articul,
    name,
    url,
    sectionTitle: "EXFO",
    description,
    pictures: [...new Set(pictures)].slice(0, 8),
    supplierSku,
    source: "ctt",
  };
}

async function scrapeCttExfo(): Promise<{ items: ExfoCatalogItem[]; warning?: string }> {
  let productUrls: string[] = [];
  try {
    productUrls = await discoverCttExfoProductUrls();
  } catch (error) {
    return {
      items: [],
      warning: `c-tt discover failed: ${error instanceof Error ? error.message : "error"}`,
    };
  }
  if (!productUrls.length) return { items: [], warning: "c-tt.shop: 0 EXFO product URLs" };

  const items: ExfoCatalogItem[] = [];
  for (const url of productUrls.slice(0, 250)) {
    try {
      const html = await fetchText(url);
      const item = parseCttProductPage(url, html);
      if (item) items.push(item);
    } catch {
      /* skip product */
    }
  }
  if (!items.length) {
    return { items: [], warning: `c-tt.shop: ${productUrls.length} URLs, 0 parsed` };
  }
  return { items };
}

async function scrapeAlfaconnectExfo(): Promise<{ items: ExfoCatalogItem[]; warning?: string }> {
  const items: ExfoCatalogItem[] = [];
  try {
    const brandHtml = await fetchText(ALFA_BRAND_URL);
    const $ = cheerio.load(brandHtml);
    const categoryLinks = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text();
      if (!/catalog|exfo|рефлект|платформ|модул|микроскоп|тестер|измерит/i.test(href + text)) {
        return;
      }
      try {
        const abs = new URL(href, "https://www.alfaconnect.by").toString();
        if (/alfaconnect\.by\/catalog/i.test(abs)) categoryLinks.add(abs);
      } catch {
        /* skip */
      }
    });

    for (const path of [
      "/catalog/izmeritelnoe-oborudovanie/platformy-exfo/",
      "/catalog/izmeritelnoe-oborudovanie/moduli-dlya-platform-exfo/",
      "/catalog/izmeritelnoe-oborudovanie/reflektometry/",
      "/catalog/izmeritelnoe-oborudovanie/opticheskie-testery/",
      "/catalog/izmeritelnoe-oborudovanie/mikroskopy/",
      "/catalog/izmeritelnoe-oborudovanie/izmeriteli-opticheskoy-moshchnosti/",
      "/catalog/izmeritelnoe-oborudovanie/istochniki-opticheskogo-izlucheniya/",
      "/catalog/izmeritelnoe-oborudovanie/vizualnyy-lokator-povrezhdeniy/",
      "/catalog/izmeritelnoe-oborudovanie/identifikatory-aktivnykh-volokon/",
      "/catalog/izmeritelnoe-oborudovanie/tsifrovye-opticheskie-attenyuatory/",
      "/catalog/izmeritelnoe-oborudovanie/aksessuary-k-oborudovaniyu/",
    ]) {
      categoryLinks.add(`https://www.alfaconnect.by${path}`);
    }

    for (const catUrl of [...categoryLinks].slice(0, 40)) {
      try {
        const html = await fetchText(catUrl);
        const $$ = cheerio.load(html);
        $$("a[href*='/catalog/']").each((_, el) => {
          const href = $$(el).attr("href") || "";
          const name = $$(el).text().replace(/\s+/g, " ").trim();
          if (!name || name.length < 8) return;
          if (!/exfo|ftb|ftbx|max-|fip|axs|olm|otdr/i.test(name + href)) return;
          if (/filter|sort|brand|page/i.test(href)) return;
          if (!/\/catalog\/[^/]+\/[^/]+\/[^/]+/i.test(href) && !/exfo/i.test(name)) return;
          try {
            const abs = new URL(href, "https://www.alfaconnect.by").toString();
            if (abs === catUrl || abs.endsWith("/")) return;
            const { articul } = resolveModelArticul(name);
            items.push({
              articul,
              name: name.includes("EXFO") ? name : `EXFO ${name}`,
              url: abs,
              sectionTitle: "EXFO",
              source: "alfaconnect",
            });
          } catch {
            /* skip */
          }
        });
      } catch {
        /* skip category */
      }
    }
  } catch (error) {
    return {
      items: [],
      warning: `alfaconnect failed: ${error instanceof Error ? error.message : "error"}`,
    };
  }

  if (!items.length) return { items: [], warning: "alfaconnect: 0 EXFO items" };
  return { items };
}

function pickPreferredUrl(prev: string, next: string, prevSource: ExfoSource, nextSource: ExfoSource): string {
  if (!prev) return next;
  if (!next) return prev;
  if (/exforus\.ru/i.test(next)) return next;
  if (/exforus\.ru/i.test(prev)) return prev;
  if (SOURCE_RANK[nextSource] > SOURCE_RANK[prevSource]) return next;
  return prev;
}

function mergeItems(groups: ExfoCatalogItem[][]): ExfoCatalogItem[] {
  const map = new Map<string, ExfoCatalogItem>();
  for (const group of groups) {
    for (const item of group) {
      const key = normalizeItemKey(item.articul);
      if (!key) continue;
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { ...item });
        continue;
      }
      const preferNext = SOURCE_RANK[item.source] >= SOURCE_RANK[prev.source];
      const better = preferNext ? item : prev;
      const other = preferNext ? prev : item;
      map.set(key, {
        articul: better.articul || other.articul,
        name: better.name || other.name,
        url: pickPreferredUrl(prev.url, item.url, prev.source, item.source),
        description: better.description || other.description || "",
        pictures:
          better.pictures && better.pictures.length
            ? better.pictures
            : other.pictures || [],
        supplierSku: better.supplierSku || other.supplierSku,
        sectionTitle: better.sectionTitle || other.sectionTitle || "EXFO",
        source: prev.source === item.source ? item.source : "merged",
      });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function readExfoCatalogCache(): ExfoCatalogCache | null {
  if (!existsSync(EXFO_CACHE_PATH)) return null;
  try {
    return JSON.parse(readFileSync(EXFO_CACHE_PATH, "utf-8")) as ExfoCatalogCache;
  } catch {
    return null;
  }
}

export function writeExfoCatalogCache(cache: ExfoCatalogCache): void {
  ensureDir();
  writeFileSync(EXFO_CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

export function countConceptExfoProducts(): number {
  return readConceptProducts().filter((p) => {
    const brand = (p.metadata?.brand || p.vendor || "").toUpperCase();
    return brand.includes("EXFO") || /\bEXFO\b/i.test(p.name || "");
  }).length;
}

export function diffExfoAgainstStore(items: ExfoCatalogItem[]): {
  inStore: number;
  willCreate: number;
  willUpdate: number;
} {
  const storeKeys = new Set(
    readConceptProducts()
      .filter((p) => {
        const brand = (p.metadata?.brand || p.vendor || "").toUpperCase();
        return brand.includes("EXFO") || /\bEXFO\b/i.test(p.name || "");
      })
      .map((p) => normalizeItemKey(p.metadata?.articul || extractArticulFromName(p.name || ""))),
  );
  let willCreate = 0;
  let willUpdate = 0;
  for (const item of items) {
    const key = normalizeItemKey(item.articul);
    if (storeKeys.has(key)) willUpdate += 1;
    else willCreate += 1;
  }
  return { inStore: storeKeys.size, willCreate, willUpdate };
}

/** Seed cache from local SSD/Concept immediately (offline-safe). */
export function seedExfoCatalogFromSsd(): ExfoCatalogCache {
  const local = seedLocalExfo();
  const cache: ExfoCatalogCache = {
    fetchedAt: new Date().toISOString(),
    items: local.items,
    sources: local.items.length ? [local.source] : [],
    warnings: local.items.length
      ? undefined
      : ["Нет локального EXFO seed (SSD пуст и Concept пуст)"],
  };
  writeExfoCatalogCache(cache);
  return cache;
}

export async function fetchExfoCatalog(options?: {
  includeSsdSeed?: boolean;
  scrapeExforus?: boolean;
  scrapeCtt?: boolean;
  scrapeAlfa?: boolean;
}): Promise<ExfoCatalogCache> {
  const includeSsdSeed = options?.includeSsdSeed !== false;
  const scrapeExforus = options?.scrapeExforus !== false;
  const scrapeCtt = options?.scrapeCtt !== false;
  const scrapeAlfa = options?.scrapeAlfa !== false;

  const previous = readExfoCatalogCache();
  const previousKeys = new Set((previous?.items || []).map((i) => normalizeItemKey(i.articul)));

  const groups: ExfoCatalogItem[][] = [];
  const sources: string[] = [];
  const warnings: string[] = [];

  if (includeSsdSeed) {
    const local = seedLocalExfo();
    if (local.items.length) {
      groups.push(local.items);
      sources.push(local.source);
    }
  }

  if (scrapeExforus) {
    try {
      const result = await scrapeExforusExfo();
      if (result.warning) warnings.push(result.warning);
      if (result.items.length) {
        groups.push(result.items);
        sources.push("exforus");
      }
    } catch (error) {
      warnings.push(
        `exforus scrape error: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  if (scrapeCtt) {
    try {
      const result = await scrapeCttExfo();
      if (result.warning) warnings.push(result.warning);
      if (result.items.length) {
        groups.push(result.items);
        sources.push("ctt");
      }
    } catch (error) {
      warnings.push(`c-tt scrape error: ${error instanceof Error ? error.message : "error"}`);
    }
  }

  if (scrapeAlfa) {
    try {
      const result = await scrapeAlfaconnectExfo();
      if (result.warning) warnings.push(result.warning);
      if (result.items.length) {
        groups.push(result.items);
        sources.push("alfaconnect");
      }
    } catch (error) {
      warnings.push(
        `alfaconnect scrape error: ${error instanceof Error ? error.message : "error"}`,
      );
    }
  }

  const items = mergeItems(groups).map((item) => ({
    ...item,
    sectionTitle: item.sectionTitle || String(defaultSectionIdForExfo(item.name, item.articul)),
  }));

  let addedSincePrevious = 0;
  let updatedSincePrevious = 0;
  for (const item of items) {
    const key = normalizeItemKey(item.articul);
    if (previousKeys.has(key)) updatedSincePrevious += 1;
    else addedSincePrevious += 1;
  }

  const cache: ExfoCatalogCache = {
    fetchedAt: new Date().toISOString(),
    items,
    sources,
    warnings: warnings.length ? warnings : undefined,
    addedSincePrevious,
    updatedSincePrevious,
  };
  writeExfoCatalogCache(cache);
  return cache;
}
