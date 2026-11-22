/**
 * Crawl svc.ru catalog sections and build articul → product URL map.
 * Uses curl (node fetch fails TLS to svc.ru on some hosts).
 *
 * Usage: npx tsx scripts/svc-build-url-map.mts
 */
import { existsSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { fetchTextViaCurl } from "../lib/microinform/http-fetch";
import { MICROINFORM_DIR } from "../lib/microinform/paths";
import { readMicroinformProducts } from "../lib/microinform/store";

const OUT_PATH = path.join(MICROINFORM_DIR, "svc-url-map.json");

const SECTION_URLS = [
  "https://svc.ru/catalog/napolnye1_5160/",
  "https://svc.ru/catalog/stoechnye-191_5161/",
  "https://svc.ru/catalog/napolnye2_5163/",
  "https://svc.ru/catalog/stoechnye-192_5164/",
  "https://svc.ru/catalog/modulnye_5165/",
  "https://svc.ru/catalog/napolnye3_6467/",
  "https://svc.ru/catalog/uneversalnie_6673/",
  "https://svc.ru/catalog/invertory_1584/",
  "https://svc.ru/catalog/dlya-doma_1599/",
  "https://svc.ru/catalog/promyshlennye_1600/",
  "https://svc.ru/catalog/snmp-monitoring_5171/",
  "https://svc.ru/catalog/kreplenie-dlya-ibp-v-stoyku-19_5172/",
  "https://svc.ru/catalog/optsii_5216/",
  "https://svc.ru/catalog/pdu_5170/",
  "https://svc.ru/catalog/batareynye_bloki_5320/",
  "https://svc.ru/catalog/lineyno-interaktivnye_5159/",
  "https://svc.ru/catalog/onlayn_5162/",
  "https://svc.ru/catalog/ibp_1582/",
];

function normalizeKey(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, " ");
}

function slugToArticulGuess(slug: string): string {
  // rail-800-s → RAIL-800/S ; rto-800-lcd-r → RTO-800-LCD/R
  let s = decodeURIComponent(slug).trim();
  // Keep common trailing /S /R /A7 style as slash suffix when last token is short.
  const m = s.match(/^(.*)-([a-z0-9]{1,4})$/i);
  if (m && /^(s|r|a\d+|se|lcd|r\d+|m\d+c\d+)$/i.test(m[2])) {
    s = `${m[1]}/${m[2]}`;
  }
  return s.toUpperCase();
}

function addMap(map: Record<string, string>, key: string, url: string) {
  const k = normalizeKey(key);
  if (!k) return;
  map[k] = url;
  map[k.replace(/\s+/g, "")] = url;
  const base = k.split("/")[0] || k;
  if (!map[base]) map[base] = url;
}

if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });

const ourArticuls = new Set(
  readMicroinformProducts()
    .filter((p) => /^svc$/i.test(p.vendor || ""))
    .map((p) => normalizeKey(p.metadata?.articul || ""))
    .filter(Boolean),
);

const map: Record<string, string> = {};
const visitedSections = new Set<string>();

for (const sectionUrl of SECTION_URLS) {
  // Paginate a few pages if present.
  for (let page = 1; page <= 8; page++) {
    const url =
      page === 1 ? sectionUrl : `${sectionUrl}?PAGEN_1=${page}`;
    if (visitedSections.has(url)) continue;
    visitedSections.add(url);
    let html = "";
    try {
      html = fetchTextViaCurl(url);
    } catch (e) {
      console.log("fail", url, String(e));
      break;
    }
    const $ = cheerio.load(html);
    let foundOnPage = 0;
    $("a[href*='/catalog/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().replace(/\s+/g, " ").trim();
      let abs = "";
      try {
        abs = new URL(href, "https://svc.ru").toString();
      } catch {
        return;
      }
      // Product URLs look like /catalog/{section}/{slug}/
      const m = abs.match(/https?:\/\/(?:www\.)?svc\.ru\/catalog\/[^/]+\/([^/?#]+)\/?$/i);
      if (!m?.[1]) return;
      if (/filter|compare|clear|apply/i.test(abs)) return;
      const slug = m[1];
      const fromText = text && /^[A-Z0-9][A-Z0-9._/ -]{1,40}$/i.test(text) ? text : "";
      const guess = slugToArticulGuess(slug);
      addMap(map, guess, abs.split("?")[0]!);
      if (fromText) addMap(map, fromText, abs.split("?")[0]!);
      foundOnPage += 1;
    });
    console.log(url, "links", foundOnPage, "map", Object.keys(map).length);
    if (foundOnPage === 0 && page > 1) break;
    // Bitrix often uses PAGEN_1; stop early if no next marker and page>1 empty already handled.
  }
}

// Coverage vs our SKUs
let matched = 0;
const missing: string[] = [];
for (const a of ourArticuls) {
  const hit =
    map[a] ||
    map[a.split("/")[0] || a] ||
    map[a.replace(/\//g, "-")] ||
    map[a.replace(/[\s/-]+/g, "")];
  if (hit) matched += 1;
  else missing.push(a);
}

writeFileSync(OUT_PATH, JSON.stringify(map, null, 2), "utf8");
console.log({
  out: OUT_PATH,
  keys: Object.keys(map).length,
  ourSku: ourArticuls.size,
  matched,
  missing: missing.slice(0, 40),
});
