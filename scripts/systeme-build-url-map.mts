/**
 * Build Systeme Electric articul → product URL map from our catalog SKUs
 * (+ optional catalog crawl for aliases).
 *
 * Usage: npx tsx scripts/systeme-build-url-map.mts
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { MICROINFORM_DIR } from "../lib/microinform/paths";
import { readMicroinformProducts } from "../lib/microinform/store";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const OUT_PATH = path.join(MICROINFORM_DIR, "systeme-url-map.json");

function productUrl(articul: string): string {
  return `https://systeme.ru/product/${encodeURIComponent(articul.trim())}`;
}

async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return false;
    const html = await res.text();
    const $ = cheerio.load(html);
    const title = $("title").text();
    if (/404|не найден|not found/i.test(title)) return false;
    return /[А-Яа-яЁё]/.test($.text()) && $("h1").length > 0;
  } catch {
    return false;
  }
}

if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });

const articuls = [
  ...new Set(
    readMicroinformProducts()
      .filter((p) => /^systeme/i.test(p.vendor || ""))
      .map((p) => (p.metadata?.articul || "").trim())
      .filter(Boolean),
  ),
];

const map: Record<string, string> = {};
let ok = 0;
let miss = 0;

for (const articul of articuls) {
  const url = productUrl(articul);
  const exists = await urlExists(url);
  if (exists) {
    const key = articul.toUpperCase();
    map[key] = url;
    map[articul] = url;
    ok += 1;
    console.log("OK", articul);
  } else {
    miss += 1;
    console.log("MISS", articul);
  }
  await new Promise((r) => setTimeout(r, 100));
}

// Crawl catalog pages for extra aliases (same SKU different casing).
for (let page = 1; page <= 12; page++) {
  const listUrl = `https://systeme.ru/catalog/ibp?pageSize=100&PAGEN_1=${page}`;
  try {
    const res = await fetch(listUrl, {
      headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) continue;
    const html = await res.text();
    const $ = cheerio.load(html);
    $("a[href*='/product/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const m = href.match(/\/product\/([^/?#]+)/i);
      if (!m?.[1]) return;
      const ref = decodeURIComponent(m[1]).trim();
      if (!ref) return;
      const abs = `https://systeme.ru/product/${ref}`;
      map[ref.toUpperCase()] = abs;
      map[ref] = abs;
    });
    console.log("catalog page", page, "map size", Object.keys(map).length);
  } catch (e) {
    console.log("catalog page fail", page, String(e));
  }
  await new Promise((r) => setTimeout(r, 150));
}

writeFileSync(OUT_PATH, JSON.stringify(map, null, 2), "utf8");
console.log({ out: OUT_PATH, keys: Object.keys(map).length, skuOk: ok, skuMiss: miss });
