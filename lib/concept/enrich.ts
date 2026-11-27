import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import * as cheerio from "cheerio";
import type { ProductCharGroup, ProductRaw } from "@/lib/types";
import {
  downloadFileViaCurl,
  fetchTextWithCurlFallback,
} from "@/lib/microinform/http-fetch";
import { processMicroinformPackshot } from "@/lib/microinform/knockout-bg";
import { readExfoCatalogCache, normalizeModelKey } from "./exfo-catalog";
import { CONCEPT_DIR, KIWI_URL_MAP_PATH, PUBLIC_IMAGES_DIR } from "./paths";
import { readConceptProducts, writeConceptProducts } from "./store";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_IMAGES = 6;
const MIN_IMAGE_BYTES = 8000;

const FOOTER_CHAR_RE =
  /(?:^|\s)(?:телефон|адрес|e-?mail)\s*:|режим работы|условия доставки|способы оплаты|корзина|войти|регистрац|cookie|политик\s+конфиденц/i;

type UrlMap = Record<string, string>;

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function isSearchUrl(url: string): boolean {
  return /\/search\/?/i.test(url) || /[?&]q=/i.test(url);
}

function isKiwiHost(url: string): boolean {
  return /kiwitest\.ru|kiwitech\.ru/i.test(url);
}

function isProductUrl(url: string): boolean {
  if (!url || isSearchUrl(url)) return false;
  return (
    /\/product\//i.test(url) ||
    /kiwitest\.ru\/.+\/.+/i.test(url) ||
    /kiwitech\.ru\/.+\/.+/i.test(url) ||
    /exforus\.ru\/product\//i.test(url)
  );
}

function preferKiwiUrl(prev: string | undefined, next: string): string {
  if (!prev) return next;
  if (/kiwitest\.ru/i.test(next)) return next;
  if (/kiwitest\.ru/i.test(prev)) return prev;
  return prev || next;
}

function sanitizeHtml(pageUrl: string, html: string): string {
  const $ = cheerio.load(`<div id="teling-root">${html}</div>`);
  $("#teling-root script, #teling-root style, #teling-root iframe").remove();
  $("#teling-root [src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const abs = absoluteUrl(pageUrl, src);
    if (abs) $(el).attr("src", abs);
  });
  $("#teling-root [href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#")) return;
    const abs = absoluteUrl(pageUrl, href);
    if (abs) $(el).attr("href", abs);
  });
  return ($("#teling-root").html() || "").trim();
}

/**
 * Download a gallery image. Prefer keeping the source bytes (kiwitest serves WebP
 * even for `.jpg` URLs) — re-encoding WebP→JPEG made sharp 900×900 shots look soft.
 * Returns the written basename (e.g. `sku_1.webp`) or null.
 */
async function downloadImage(url: string, destBasePath: string): Promise<string | null> {
  const baseNoExt = destBasePath.replace(/\.[^.]+$/i, "");
  const rawPath = `${baseNoExt}.raw.bin`;
  const tmpPath = `${baseNoExt}.tmp.bin`;
  try {
    for (const p of [rawPath, tmpPath]) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        /* ignore */
      }
    }

    let got = downloadFileViaCurl(url, rawPath);
    if (!got) {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "image/*" },
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok || !res.body) return null;
      // @ts-expect-error undici body → node stream
      await pipeline(Readable.fromWeb(res.body), createWriteStream(rawPath));
      got = existsSync(rawPath);
    }
    if (!got) return null;

    const sharp = (await import("sharp")).default;
    const { writeFileSync, readFileSync } = await import("fs");
    // Read into memory first so Windows file locks from sharp don't block cleanup.
    const rawBuf = readFileSync(rawPath);
    const meta = await sharp(rawBuf).metadata();
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w < 200 || h < 200) return null;

    const fmt = (meta.format || "").toLowerCase();
    const keepAsIs =
      (fmt === "webp" || fmt === "jpeg" || fmt === "jpg" || fmt === "png") &&
      w <= 2000 &&
      h <= 2000 &&
      !meta.orientation;

    let outExt = "jpg";
    if (fmt === "webp") outExt = "webp";
    else if (fmt === "png") outExt = "png";
    else if (fmt === "jpeg" || fmt === "jpg") outExt = "jpg";

    const finalPath = `${baseNoExt}.${outExt}`;
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const p = `${baseNoExt}.${ext}`;
      if (p !== finalPath && existsSync(p)) {
        try {
          unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }

    if (keepAsIs) {
      writeFileSync(finalPath, rawBuf);
    } else {
      const jpegFinal = `${baseNoExt}.jpg`;
      const outBuf = await sharp(rawBuf)
        .rotate()
        .resize({
          width: 1600,
          height: 1600,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 92, mozjpeg: true })
        .toBuffer();
      try {
        if (existsSync(jpegFinal)) unlinkSync(jpegFinal);
      } catch {
        /* ignore */
      }
      writeFileSync(jpegFinal, outBuf);
      if (!existsSync(jpegFinal) || statSync(jpegFinal).size < MIN_IMAGE_BYTES) return null;
      return path.basename(jpegFinal);
    }

    if (!existsSync(finalPath) || statSync(finalPath).size < MIN_IMAGE_BYTES) return null;
    return path.basename(finalPath);
  } catch {
    return null;
  } finally {
    for (const p of [rawPath, tmpPath]) {
      try {
        if (existsSync(p)) unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  }
}

function extractChars($: cheerio.CheerioAPI): ProductCharGroup[] {
  const items: Array<{ name: string; value: string }> = [];
  const pushRow = (name: string, value: string) => {
    const n = name.replace(/\s+/g, " ").trim();
    const v = value.replace(/\s+/g, " ").trim();
    if (!n || !v || n.length > 80 || v.length > 200) return;
    if (/цена|наличие|код-позиции|артикул/i.test(n)) return;
    if (FOOTER_CHAR_RE.test(n) || FOOTER_CHAR_RE.test(v)) return;
    if (/^\+?\d[\d\s()-]{6,}$/.test(v)) return;
    items.push({ name: n, value: v });
  };

  $("table tr").each((_, el) => {
    const cells = $(el).find("td, th");
    if (cells.length < 2) return;
    pushRow($(cells[0]).text(), $(cells[1]).text());
  });

  $(".props_block .properties__item, .char_block .properties__item, dl").each((_, el) => {
    const name =
      $(el).find("dt, .properties__title, .char_name").first().text() ||
      $(el).children().first().text();
    const value =
      $(el).find("dd, .properties__value, .char_value").first().text() ||
      $(el).children().last().text();
    pushRow(name, value);
  });

  if (!items.length) return [];
  return [{ name: "Характеристики", items: items.slice(0, 40) }];
}

/**
 * Bitrix resize dirs look like `900_900_<md5>/filename.jpg` (hash, not a plain number).
 * Soft /upload/iblock originals are often worse than these display copies.
 */
function isLargeBitrixResize(src: string): boolean {
  return /\/(?:12\d{2}|14\d{2}|9\d{2}|8\d{2}|7\d{2}|6\d{2}|5\d{2})_(?:12\d{2}|14\d{2}|9\d{2}|8\d{2}|7\d{2}|6\d{2}|5\d{2})_[a-f0-9]+\//i.test(
    src,
  );
}

function isTinyBitrixResize(src: string): boolean {
  return /\/(?:\d{2}|\d{3})_(?:\d{2}|\d{3})_(?:0|[a-f0-9]+)\//i.test(src) && !isLargeBitrixResize(src);
}

function isJunkImageUrl(src: string): boolean {
  if (!src || src.startsWith("data:")) return true;
  if (
    /logo|icon|favicon|sprite|svg|pixel|1x1|service_|nonmanufac|yandeks|direkt|banner|header|CPriority|KIVITEKH_logo|mchfnw33vhvimknu|концепт|concept/i.test(
      src,
    )
  ) {
    return true;
  }
  // Known site-chrome iblock hashes (Concept logo / promo strips), not product shots.
  if (/\/iblock\/(?:f32|9ce)\b/i.test(src)) return true;
  if (isTinyBitrixResize(src)) return true;
  if (/resize_cache/i.test(src) && !isLargeBitrixResize(src)) return true;
  return false;
}

/** Reject logos, banners and chrome after download (URL filters miss renamed files). */
export function isJunkDownloadedImage(width: number, height: number, byteSize: number): boolean {
  const w = width || 0;
  const h = height || 0;
  if (w < 200 || h < 200) return true;
  if (byteSize > 0 && byteSize < MIN_IMAGE_BYTES) return true;
  const ar = h > 0 ? w / h : 0;
  // Wide site headers / tall sidebar promos.
  if (ar >= 2.4 || ar <= 0.42) return true;
  // Fingerprints seen across KIWI enrich: Concept logo, «Поверка…» banner, 1400×200 strip.
  if (w === 560 && h === 269) return true;
  if (w === 800 && h === 533) return true;
  if (w === 250 && h === 450) return true;
  if (w === 1400 && h === 200) return true;
  if (w <= 120 && h <= 120) return true;
  return false;
}

function imageIdentityKey(url: string): string {
  // .../iblock/3af/epz1rr….jpg  or  .../3af/900_900_<hash>/epz1rr….jpg → same key
  const m = url.match(
    /\/iblock\/([a-z0-9]+)\/(?:\d+_\d+_[a-f0-9]+\/)?([^/?#]+)$/i,
  );
  if (m) return `${m[1]}/${m[2]}`.toLowerCase();
  return url.toLowerCase();
}

function collectImageUrls($: cheerio.CheerioAPI, pageUrl: string): string[] {
  const preferred = new Map<string, string>(); // identity → url
  const rank = (url: string): number => {
    if (isLargeBitrixResize(url)) return 3;
    if (/\/upload\/iblock\//i.test(url) && !/resize_cache/i.test(url)) return 2;
    return 1;
  };
  const push = (raw: string | undefined | null) => {
    if (!raw || isJunkImageUrl(raw)) return;
    if (!/\/upload\/iblock\//i.test(raw) && !/\.(jpe?g|png|webp)(\?|$)/i.test(raw)) return;
    const abs = absoluteUrl(pageUrl, raw);
    if (!abs) return;
    const key = imageIdentityKey(abs);
    const prev = preferred.get(key);
    if (!prev || rank(abs) > rank(prev)) preferred.set(key, abs);
  };

  // Keep gallery-only roots — `.catalog-detail` / body scrape pull Concept logos and banners.
  const galleryRoot =
    ".catalog-detail__gallery, .detail-gallery-big, .product-detail-gallery, .product-item-detail-slider-container";

  // Prefer sharp Bitrix 900_900 display images from gallery <img>, then lightbox hrefs.
  $(galleryRoot)
    .find("img")
    .each((_, el) => {
      push($(el).attr("src"));
      push($(el).attr("data-src"));
      push($(el).attr("data-big"));
      push($(el).attr("data-large"));
    });
  $(galleryRoot)
    .find("a[href*='/upload/']")
    .each((_, el) => push($(el).attr("href")));

  if (!preferred.size) {
    // Last resort: only product iblock images, never site chrome.
    $("img").each((_, el) => {
      const raw = $(el).attr("data-src") || $(el).attr("src");
      if (!raw || !/\/upload\/iblock\//i.test(raw)) return;
      push(raw);
    });
  }

  return [...preferred.values()].slice(0, MAX_IMAGES);
}

function readUrlMap(): UrlMap {
  if (!existsSync(KIWI_URL_MAP_PATH)) return {};
  try {
    return JSON.parse(readFileSync(KIWI_URL_MAP_PATH, "utf-8")) as UrlMap;
  } catch {
    return {};
  }
}

function writeUrlMap(map: UrlMap): void {
  if (!existsSync(CONCEPT_DIR)) mkdirSync(CONCEPT_DIR, { recursive: true });
  writeFileSync(KIWI_URL_MAP_PATH, JSON.stringify(map, null, 2), "utf-8");
}

function mapKey(articul: string): string {
  return String(articul || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

/** Strip config suffixes: "KIWI-1130 Kit" / "KIWI-3140 KIT 2" → "KIWI-1130" / "KIWI-3140". */
function kiwiBaseModelKey(articul: string): string {
  return mapKey(articul)
    .replace(/[-_]?KIT\d*$/i, "")
    .replace(/[-_]?(KIT|КОМПЛЕКТ).*$/i, "");
}

/** Series variants share one card: KIWI-4223 → KIWI-4220; KIWI-430X-AD → KIWI-4300; KIWI-73XX-FC → KIWI-7300. */
function kiwiSeriesFallbackKeys(articul: string): string[] {
  const rawKey = mapKey(articul);
  const key = kiwiBaseModelKey(articul) || rawKey;
  const out: string[] = [];
  if (key && key !== rawKey) out.push(key);

  // Neighbor instrument cards when kit SKU has no own page (1130→1120, 3140→3130).
  const num = key.match(/^KIWI-?(\d{4})\b/i)?.[1];
  if (num) {
    const n = Number(num);
    if (Number.isFinite(n)) {
      out.push(mapKey(`KIWI-${n - 10}`), mapKey(`KIWI-${n - 1}`), mapKey(`KIWI-${n + 1}`));
    }
  }

  // Placeholder X/XX options: KIWI-430X-AD, KIWI-73XX-FC, KIWI-423X-VFL
  const x = key.match(/^KIWI-?(\d{2,3})X{1,2}([A-Z0-9-]*)$/i);
  if (x) {
    out.push(mapKey(`KIWI-${x[1]}00`), mapKey(`KIWI-${x[1]}0`), mapKey(`KIWI-${x[1]}1`));
    if (x[1].length === 2) out.push(mapKey(`KIWI-${x[1]}00`));
  }

  const m = key.match(/^KIWI-?(\d{3})(\d)([A-Z0-9-]*)$/i);
  if (m) {
    const stem = m[1];
    const suffix = m[3] || "";
    out.push(
      mapKey(`KIWI-${stem}0${suffix}`),
      mapKey(`KIWI-${stem}0`),
      mapKey(`KIWI-${stem}1${suffix}`),
      mapKey(`KIWI-${stem}1`),
    );
  }

  // Common accessory aliases → nearest catalog card.
  if (/^KIWI-VFL$/i.test(key)) out.push("KIWI-4111", "KIWI-4100");
  if (/^KIWI-4620$/i.test(key)) out.push("KIWI-4600", "KIWI-4610");
  if (/^KIWI-(LS|PM|FP|LM)$/i.test(key)) out.push("KIWI-7451", "KIWI-7431", "KIWI-7300");

  return [...new Set(out.filter((k) => k && k !== rawKey))];
}

function lookupUrlMap(map: UrlMap, articul: string): string {
  const key = mapKey(articul);
  const base = kiwiBaseModelKey(articul);
  if (map[key] && isProductUrl(map[key])) return map[key];
  if (base && map[base] && isProductUrl(map[base])) return map[base];

  // Prefix match: KIWI-7300-SM → KIWI-7300 page
  for (const candidate of [base, key].filter(Boolean)) {
    const compact = candidate.replace(/[^A-Z0-9]/g, "");
    let best = "";
    let bestLen = 0;
    for (const [k, url] of Object.entries(map)) {
      if (!isProductUrl(url)) continue;
      const ck = k.replace(/[^A-Z0-9]/g, "");
      if (compact.startsWith(ck) && ck.length >= 8 && ck.length > bestLen) {
        best = url;
        bestLen = ck.length;
      }
      if (ck.startsWith(compact) && compact.length >= 8 && compact.length > bestLen) {
        best = url;
        bestLen = compact.length;
      }
    }
    if (best) return best;
  }

  // Wavelength / option / kit variants of the same series (4221–4225 → 4220; 1130 Kit → 1120).
  for (const fb of kiwiSeriesFallbackKeys(articul)) {
    if (map[fb] && isProductUrl(map[fb])) return map[fb];
  }
  const series = (base || key).match(/^KIWI-?(\d{3})\d/i)?.[1];
  if (series) {
    let seriesBest = "";
    let seriesScore = -1;
    for (const [k, url] of Object.entries(map)) {
      if (!isProductUrl(url)) continue;
      const km = k.match(/^KIWI-?(\d{3})(\d)/i);
      if (!km || km[1] !== series) continue;
      // Prefer *0 base model, then *1.
      const score = km[2] === "0" ? 2 : km[2] === "1" ? 1 : 0;
      if (score > seriesScore) {
        seriesScore = score;
        seriesBest = url;
      }
    }
    if (seriesBest) return seriesBest;
  }
  return "";
}

function collectKiwiProductLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("a[href*='/product/']").each((_, el) => {
    const href = ($(el).attr("href") || "").split("?")[0];
    const abs = absoluteUrl(baseUrl, href);
    if (!abs || !isKiwiHost(abs) || !/\/product\//i.test(abs)) return;
    if (/index\.php|filter|sort|compare|apply/i.test(abs)) return;
    const parts = new URL(abs).pathname.split("/").filter(Boolean);
    if (parts.length < 4) return;
    if (!/kiwi/i.test(abs)) return;
    urls.add(abs);
  });
  return [...urls];
}

function extractKiwiArticulFromPage(html: string, url: string): string[] {
  const $ = cheerio.load(html);
  const texts: string[] = [];
  // Only product header — full body mentions sibling models and poisons the URL map.
  const detail = $(".catalog-detail, .js-popup-block, h1")
    .text()
    .replace(/\s+/g, " ");
  for (const m of detail.matchAll(/Арт\.?\s*(KIWI[-\s]?[A-Z0-9-]+)/gi)) {
    texts.push(m[1]);
  }
  const h1 = $("h1").first().text();
  for (const m of h1.matchAll(/\b(KIWI-\d{3,5}[A-Z0-9-]*)\b/gi)) {
    texts.push(m[1]);
  }
  const slug = url.split("/").filter(Boolean).pop() || "";
  const fromSlug = slug.match(/kiwi[_-]?(\d{3,5}[a-z0-9_-]*)/i)?.[1];
  if (fromSlug) texts.push(`KIWI-${fromSlug.replace(/_/g, "-")}`);
  const normalized = [
    ...new Set(
      texts
        .map((t) => t.replace(/\s+/g, "-").toUpperCase().replace(/-+/g, "-"))
        .filter((t) => /^KIWI-\d/i.test(t)),
    ),
  ];
  // Prefer articuls that appear in the product URL slug.
  const slugCompact = slug.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return normalized.sort((a, b) => {
    const aHit = slugCompact.includes(a.replace(/[^A-Z0-9]/g, "").replace(/^KIWI/, ""))
      ? 1
      : 0;
    const bHit = slugCompact.includes(b.replace(/[^A-Z0-9]/g, "").replace(/^KIWI/, ""))
      ? 1
      : 0;
    return bHit - aHit;
  });
}

async function crawlKiwiHost(host: string): Promise<string[]> {
  const categoryUrls = new Set<string>([
    `${host}/product/`,
    `${host}/product/izmeritelnoe-oborudovanie/`,
    `${host}/product/svarochnye-apparaty-i-instrument/`,
  ]);
  const productUrls = new Set<string>();

  try {
    const rootHtml = await fetchTextWithCurlFallback(`${host}/product/`);
    const $ = cheerio.load(rootHtml);
    $("a[href*='/product/']").each((_, el) => {
      const abs = absoluteUrl(host, ($(el).attr("href") || "").split("?")[0] || "");
      if (!abs) return;
      const parts = new URL(abs).pathname.split("/").filter(Boolean);
      if (parts[0] === "product" && parts.length >= 2 && parts.length <= 3) {
        categoryUrls.add(abs.endsWith("/") ? abs : `${abs}/`);
      }
      if (parts[0] === "product" && parts.length >= 4 && /kiwi/i.test(abs)) {
        productUrls.add(abs);
      }
    });
  } catch {
    /* keep seeded categories */
  }

  for (const catUrl of [...categoryUrls].slice(0, 80)) {
    try {
      const html = await fetchTextWithCurlFallback(catUrl);
      for (const u of collectKiwiProductLinks(html, catUrl)) productUrls.add(u);
      const nested = cheerio.load(html);
      nested("a[href*='/product/']").each((_, el) => {
        const abs = absoluteUrl(host, (nested(el).attr("href") || "").split("?")[0] || "");
        if (!abs) return;
        const parts = new URL(abs).pathname.split("/").filter(Boolean);
        if (parts[0] === "product" && parts.length === 3) {
          categoryUrls.add(abs.endsWith("/") ? abs : `${abs}/`);
        }
      });
    } catch {
      /* skip category */
    }
  }

  return [...productUrls];
}

/** Crawl kiwitest.ru (preferred) + kiwitech.ru → articul URL map. */
async function ensureKiwiUrlIndex(force = false): Promise<UrlMap> {
  const existing = readUrlMap();
  const hasKiwitest = Object.values(existing).some((u) => /kiwitest\.ru/i.test(u));
  if (!force && Object.keys(existing).length >= 40 && hasKiwitest) return existing;

  const map: UrlMap = { ...existing };
  // Prefer kiwitest.ru (official measuring catalog), then kiwitech.ru.
  const hosts = ["https://www.kiwitest.ru", "https://www.kiwitech.ru"];
  for (const host of hosts) {
    let productUrls: string[] = [];
    try {
      productUrls = await crawlKiwiHost(host);
    } catch {
      continue;
    }
    for (const url of productUrls.slice(0, 350)) {
      try {
        const html = await fetchTextWithCurlFallback(url);
        for (const art of extractKiwiArticulFromPage(html, url)) {
          const key = mapKey(art);
          const artDigits = key.replace(/^KIWI/i, "").replace(/[^A-Z0-9]/g, "");
          const pathHit =
            artDigits.length >= 3 &&
            url.toUpperCase().replace(/[^A-Z0-9]/g, "").includes(artDigits);
          // Never overwrite a path-matching URL with an unrelated sibling page.
          if (map[key] && !pathHit) continue;
          map[key] = preferKiwiUrl(map[key], url);
        }
      } catch {
        /* skip product */
      }
    }
  }

  writeUrlMap(map);
  return map;
}

async function resolveKiwiUrl(articul: string, existingUrl: string): Promise<string> {
  const map = await ensureKiwiUrlIndex(false);
  const hit = lookupUrlMap(map, articul);
  // Prefer map (series fallback / corrected paths) over a stale product URL.
  if (hit) return hit;

  if (existingUrl && isProductUrl(existingUrl) && isKiwiHost(existingUrl)) {
    return existingUrl;
  }

  // Search kiwitest first, then kiwitech (skip c-tt — hangs from this network).
  for (const host of ["https://www.kiwitest.ru", "https://www.kiwitech.ru"]) {
    try {
      const searchUrl = `${host}/search/?q=${encodeURIComponent(articul)}`;
      const html = await fetchTextWithCurlFallback(searchUrl);
      const $ = cheerio.load(html);
      const artRe = new RegExp(articul.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      let found = "";
      $("a[href*='/product/']").each((_, el) => {
        if (found) return;
        const href = $(el).attr("href") || "";
        const text = $(el).text();
        if (!/kiwi/i.test(href)) return;
        if (!artRe.test(href + text) && !artRe.test(href)) return;
        const abs = absoluteUrl(searchUrl, href);
        if (abs && isProductUrl(abs)) found = abs;
      });
      if (found) {
        map[mapKey(articul)] = preferKiwiUrl(map[mapKey(articul)], found);
        writeUrlMap(map);
        return found;
      }
    } catch {
      /* try next host */
    }
  }
  return "";
}

function resolveExfoUrl(articul: string, existingUrl: string): string {
  if (existingUrl && isProductUrl(existingUrl) && !/ssd\.ru/i.test(existingUrl)) {
    return existingUrl;
  }
  const key = normalizeModelKey(articul);
  const cache = readExfoCatalogCache();
  if (!cache) return isProductUrl(existingUrl) ? existingUrl : "";
  const hit = cache.items.find(
    (i) =>
      normalizeModelKey(i.articul) === key ||
      normalizeModelKey(extractLooseModel(i.name)) === key,
  );
  if (hit?.url && isProductUrl(hit.url)) return hit.url;
  return isProductUrl(existingUrl) ? existingUrl : "";
}

function extractLooseModel(name: string): string {
  const m = name.match(
    /\b((?:FTB\s*Lite[-\s]?\d{0,4}[A-Z]?|FTBx?-\d{1,4}[A-Z0-9-]*|MAX(?:Tester)?[-\s]?\d{0,4}[A-Z0-9-]*|FIP-\d{2,4}[A-Z]?|PX1(?:-PRO)?(?:-[A-Z0-9]+)*)\b)/i,
  );
  return m?.[1]?.replace(/\s+/g, "-") || "";
}

function charsLookLikeFooter(chars: ProductCharGroup[] | undefined): boolean {
  if (!chars?.length) return false;
  const blob = chars
    .flatMap((g) => g.items.map((i) => `${i.name} ${i.value}`))
    .join(" ");
  return FOOTER_CHAR_RE.test(blob);
}

/** Strip previously saved junk from Concept products (search URLs, footer chars). */
export function sanitizeConceptEnrichment(): {
  clearedUrls: number;
  clearedChars: number;
  clearedPics: number;
} {
  const products = readConceptProducts();
  let clearedUrls = 0;
  let clearedChars = 0;
  let clearedPics = 0;

  for (const product of products) {
    const vendor = (product.vendor || product.metadata?.brand || "").toUpperCase();
    const url = product.metadata?.url || "";
    if (url && isSearchUrl(url)) {
      product.metadata.url = "";
      clearedUrls += 1;
    }
    if (charsLookLikeFooter(product.metadata?.chars)) {
      product.metadata.chars = [];
      clearedChars += 1;
    }
    if (
      vendor === "KIWI" &&
      !product.metadata?.description?.trim() &&
      (product.metadata?.pictures?.length || 0) > 0
    ) {
      // Likely listing/search images without real product page.
      product.metadata.pictures = [];
      clearedPics += 1;
    }
  }

  writeConceptProducts(products);
  return { clearedUrls, clearedChars, clearedPics };
}

async function enrichOne(product: ProductRaw): Promise<{
  product: ProductRaw;
  ok: boolean;
  imagesDownloaded: number;
  error?: string;
}> {
  const vendor = (product.vendor || product.metadata?.brand || "").toUpperCase();
  let pageUrl = product.metadata?.url || "";
  if (pageUrl && isSearchUrl(pageUrl)) pageUrl = "";

  if (vendor === "KIWI") {
    pageUrl = await resolveKiwiUrl(product.metadata?.articul || "", pageUrl);
  } else if (vendor === "EXFO") {
    pageUrl = resolveExfoUrl(product.metadata?.articul || "", pageUrl);
  }

  if (!pageUrl || !isProductUrl(pageUrl)) {
    return {
      product: {
        ...product,
        metadata: {
          ...product.metadata,
          url: "",
        },
      },
      ok: false,
      imagesDownloaded: 0,
      error: "no-product-url",
    };
  }

  let html = "";
  try {
    html = await fetchTextWithCurlFallback(pageUrl);
  } catch (error) {
    return {
      product: {
        ...product,
        metadata: { ...product.metadata, url: pageUrl },
      },
      ok: false,
      imagesDownloaded: 0,
      error: error instanceof Error ? error.message : "fetch-failed",
    };
  }

  // If somehow still on search — hop once to product, else fail.
  if (isSearchUrl(pageUrl)) {
    const $ = cheerio.load(html);
    let nextUrl = "";
    const art = product.metadata?.articul || "";
    $("a[href*='/product/']").each((_, el) => {
      if (nextUrl) return;
      const href = $(el).attr("href") || "";
      const text = $(el).text();
      if (
        art &&
        new RegExp(art.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(href + text)
      ) {
        const abs = absoluteUrl(pageUrl, href);
        if (abs && isProductUrl(abs)) nextUrl = abs;
      }
    });
    if (!nextUrl) {
      return { product, ok: false, imagesDownloaded: 0, error: "stuck-on-search" };
    }
    pageUrl = nextUrl;
    try {
      html = await fetchTextWithCurlFallback(pageUrl);
    } catch (error) {
      return {
        product: { ...product, metadata: { ...product.metadata, url: pageUrl } },
        ok: false,
        imagesDownloaded: 0,
        error: error instanceof Error ? error.message : "product-fetch-failed",
      };
    }
  }

  const $ = cheerio.load(html);
  // Prefer real content blocks in priority order (NOT DOM order of a combined selector —
  // previewtext "Подробности" often appears before #desc).
  const descSelectors = [
    "#desc",
    ".product-item-detail-tab-content",
    ".detail_text",
    "[itemprop='description']",
    ".product__description",
    ".content_body",
    ".catalog-detail__previewtext",
    ".ordered-block",
  ];
  let descHtml = "";
  let descText = "";
  for (const sel of descSelectors) {
    const node = $(sel).first();
    if (!node.length) continue;
    const htmlChunk = sanitizeHtml(pageUrl, node.html() || "");
    const text = cheerio
      .load(`<div>${htmlChunk}</div>`)("div")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 40) continue;
    if (FOOTER_CHAR_RE.test(text.slice(0, 120))) continue;
    if (/^подробности$/i.test(text)) continue;
    descHtml = htmlChunk;
    descText = text;
    break;
  }
  const usableDesc = descHtml;

  const chars = extractChars($);
  const imageUrls = collectImageUrls($, pageUrl);

  if (!existsSync(PUBLIC_IMAGES_DIR)) mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });

  const pictures: string[] = [];
  let imagesDownloaded = 0;
  const skuSafe = product.sku.replace(/[^a-zA-Z0-9_-]/g, "_");
  const { readdirSync, readFileSync, writeFileSync } = await import("fs");

  // Download into temporary `_tmpN` slots first so a failed scrape cannot wipe good files.
  const tmpWritten: string[] = [];
  for (let i = 0; i < imageUrls.length; i++) {
    const destBase = path.join(PUBLIC_IMAGES_DIR, `${skuSafe}_tmp${i + 1}.jpg`);
    const written = await downloadImage(imageUrls[i], destBase);
    if (!written) continue;
    const abs = path.join(PUBLIC_IMAGES_DIR, written);
    if (!existsSync(abs)) continue;
    const size = statSync(abs).size;
    if (size < MIN_IMAGE_BYTES) {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(abs).metadata();
      if (isJunkDownloadedImage(meta.width || 0, meta.height || 0, size)) {
        unlinkSync(abs);
        continue;
      }
    } catch {
      try {
        unlinkSync(abs);
      } catch {
        /* ignore */
      }
      continue;
    }
    tmpWritten.push(written);
  }

  if (tmpWritten.length > 0) {
    // Replace old gallery with fresh non-junk shots, contiguous `_1…`.
    for (const f of readdirSync(PUBLIC_IMAGES_DIR)) {
      if (!f.startsWith(`${skuSafe}_`) && f !== `${skuSafe}.jpg` && f !== `${skuSafe}.webp`) {
        continue;
      }
      if (tmpWritten.includes(f)) continue;
      try {
        unlinkSync(path.join(PUBLIC_IMAGES_DIR, f));
      } catch {
        /* ignore */
      }
    }
    for (let i = 0; i < tmpWritten.length; i++) {
      const from = path.join(PUBLIC_IMAGES_DIR, tmpWritten[i]);
      const ext = path.extname(tmpWritten[i]) || ".jpg";
      const toName = `${skuSafe}_${i + 1}${ext}`;
      const to = path.join(PUBLIC_IMAGES_DIR, toName);
      if (from !== to) {
        const buf = readFileSync(from);
        try {
          if (existsSync(to)) unlinkSync(to);
        } catch {
          /* ignore */
        }
        writeFileSync(to, buf);
        try {
          unlinkSync(from);
        } catch {
          /* ignore */
        }
      }
      // Same white→transparent knockout as Microinform / SSD packshots.
      let publicName = toName;
      try {
        const webpPath = await processMicroinformPackshot(to);
        publicName = path.basename(webpPath);
      } catch {
        /* keep opaque if knockout fails */
      }
      pictures.push(`/images/${publicName}`);
      imagesDownloaded += 1;
    }
  }

  // Keep previous non-junk files only when this run downloaded nothing.
  const prevPics: string[] = [];
  if (pictures.length === 0) {
    for (const f of readdirSync(PUBLIC_IMAGES_DIR).filter((name) => name.startsWith(`${skuSafe}_`))) {
      const fp = path.join(PUBLIC_IMAGES_DIR, f);
      try {
        const size = statSync(fp).size;
        if (size < MIN_IMAGE_BYTES) {
          unlinkSync(fp);
          continue;
        }
        const sharp = (await import("sharp")).default;
        const meta = await sharp(fp).metadata();
        if (isJunkDownloadedImage(meta.width || 0, meta.height || 0, size)) {
          unlinkSync(fp);
          continue;
        }
        prevPics.push(`/images/${f}`);
      } catch {
        /* ignore */
      }
    }
  }
  const finalPics = pictures.length > 0 ? pictures : usableDesc ? prevPics.slice(0, MAX_IMAGES) : [];

  const next: ProductRaw = {
    ...product,
    metadata: {
      ...product.metadata,
      url: pageUrl,
      description: usableDesc || product.metadata.description || "",
      chars: chars.length ? chars : product.metadata.chars || [],
      pictures: finalPics.slice(0, MAX_IMAGES),
    },
  };

  const ok = Boolean(
    next.metadata.description?.trim() || next.metadata.pictures.length >= 1,
  );
  return {
    product: next,
    ok,
    imagesDownloaded,
    error: ok
      ? undefined
      : descText
        ? "weak-description"
        : "no-description",
  };
}

export async function enrichConceptProducts(options?: {
  onlyMissing?: boolean;
  limit?: number;
  productIds?: number[];
  delayMs?: number;
  sanitizeFirst?: boolean;
}): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  withDescription: number;
  imagesDownloaded: number;
  sanitized?: { clearedUrls: number; clearedChars: number; clearedPics: number };
  errors: Array<{ sku: string; articul: string; error: string }>;
}> {
  const onlyMissing = options?.onlyMissing !== false;
  const limit = options?.limit ?? 30;
  const delayMs = options?.delayMs ?? 400;
  const idSet = options?.productIds?.length ? new Set(options.productIds) : null;
  const sanitizeFirst = options?.sanitizeFirst !== false;

  const sanitized = sanitizeFirst ? sanitizeConceptEnrichment() : undefined;
  // Warm KIWI URL index once so per-product resolve does not hit hanging c-tt search.
  try {
    await ensureKiwiUrlIndex(false);
  } catch {
    /* index best-effort */
  }
  const products = readConceptProducts();
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let withDescription = 0;
  let imagesDownloaded = 0;
  const errors: Array<{ sku: string; articul: string; error: string }> = [];

  for (let i = 0; i < products.length; i++) {
    if (processed >= limit) break;
    const product = products[i];
    if (idSet && !idSet.has(product.id)) continue;

    const hasDesc = Boolean(product.metadata?.description?.trim());
    const hasPics = (product.metadata?.pictures?.length || 0) > 0;
    const badUrl = isSearchUrl(product.metadata?.url || "");
    if (onlyMissing && hasDesc && hasPics && !badUrl) continue;

    processed += 1;
    const result = await enrichOne(product);
    products[i] = result.product;
    imagesDownloaded += result.imagesDownloaded;
    if (result.product.metadata?.description?.trim()) withDescription += 1;
    if (result.ok) succeeded += 1;
    else {
      failed += 1;
      errors.push({
        sku: product.sku,
        articul: product.metadata?.articul || "",
        error: result.error || "failed",
      });
    }

    if (processed % 10 === 0) writeConceptProducts(products);
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  writeConceptProducts(products);
  return {
    processed,
    succeeded,
    failed,
    withDescription,
    imagesDownloaded,
    sanitized,
    errors: errors.slice(0, 50),
  };
}
