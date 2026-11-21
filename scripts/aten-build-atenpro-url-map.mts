/**
 * Build ATEN model → atenpro.ru product URL map from catalog sitemap.
 * Usage: npx tsx scripts/aten-build-atenpro-url-map.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normalizeMicroinformArticul } from "../lib/microinform/articul";
import { MICROINFORM_DIR } from "../lib/microinform/paths";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUT_PATH = path.join(MICROINFORM_DIR, "atenpro-url-map.json");
const SITEMAP = "https://www.atenpro.ru/sitemap-iblock-215.xml";

function slugTokens(url: string): string[] {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const leaf = pathname.split("/").filter(Boolean).pop() || "";
    return leaf.split(/[^a-z0-9]+/i).filter((t) => t.length >= 2);
  } catch {
    return [];
  }
}

function modelKeysFromArticul(articul: string): string[] {
  const norm = normalizeMicroinformArticul("ATEN", articul).toUpperCase();
  if (!norm) return [];
  const keys = new Set<string>([norm, norm.split("/")[0] || norm]);
  keys.add(norm.replace(/-/g, ""));
  keys.add((norm.split("/")[0] || norm).replace(/-/g, ""));
  return [...keys].filter(Boolean);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });

const xml = await fetchText(SITEMAP);
const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
const catalogUrls = urls.filter((u) => /\/catalog\//i.test(u) && !u.endsWith("/catalog/"));

const products = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/products.microinform.json"), "utf8"),
) as Array<{ vendor?: string; metadata?: { articul?: string } }>;

let priceArts: string[] = [];
try {
  const price = JSON.parse(
    readFileSync(path.join(MICROINFORM_DIR, "price-parsed.json"), "utf8"),
  ) as { products?: Array<{ vendor?: string; articul?: string }> };
  priceArts = (price.products || [])
    .filter((p) => /^aten$/i.test(p.vendor || ""))
    .map((p) => String(p.articul || ""));
} catch {
  /* optional */
}

const atenArts = [
  ...products.filter((p) => /^aten$/i.test(p.vendor || "")).map((p) => String(p.metadata?.articul || "")),
  ...priceArts,
];

type ModelInfo = { keys: string[]; preferred: string };
const models: ModelInfo[] = [];
const seenPreferred = new Set<string>();
for (const art of atenArts) {
  const preferred = normalizeMicroinformArticul("ATEN", art).toUpperCase();
  if (!preferred || seenPreferred.has(preferred)) continue;
  seenPreferred.add(preferred);
  models.push({ preferred, keys: modelKeysFromArticul(art) });
}

// Also index by compact lowercase key for slug matching.
const byCompact = new Map<string, string>();
for (const m of models) {
  for (const k of m.keys) {
    const compact = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (compact.length < 3) continue;
    if (!byCompact.has(compact)) byCompact.set(compact, m.preferred);
  }
}

const map: Record<string, string> = {};
let matchedUrls = 0;

for (const url of catalogUrls) {
  const tokens = slugTokens(url);
  if (!tokens.length) continue;
  // Prefer longest compact token that matches a known model.
  let best: { model: string; score: number } | null = null;
  for (const token of tokens) {
    const compact = token.replace(/[^a-z0-9]/g, "");
    if (compact.length < 3) continue;
    const model = byCompact.get(compact);
    if (!model) continue;
    const score = compact.length;
    if (!best || score > best.score) best = { model, score };
  }
  if (!best) continue;

  // Skip shallow category pages when a deeper product leaf looks like model page.
  const depth = new URL(url).pathname.split("/").filter(Boolean).length;
  if (depth < 3) continue;

  matchedUrls += 1;
  const prev = map[best.model];
  // Prefer URLs that contain the model slug explicitly and are shorter.
  const leaf = (new URL(url).pathname.split("/").filter(Boolean).pop() || "").toLowerCase();
  const modelSlug = best.model.toLowerCase().replace(/[^a-z0-9]/g, "");
  const leafHasModel = leaf.includes(modelSlug);
  const prevLeaf = prev
    ? (new URL(prev).pathname.split("/").filter(Boolean).pop() || "").toLowerCase()
    : "";
  const prevHas = prevLeaf.includes(modelSlug);
  if (!prev || (leafHasModel && !prevHas) || (leafHasModel === prevHas && url.length < prev.length)) {
    map[best.model] = url.endsWith("/") ? url : `${url}/`;
  }
}

writeFileSync(OUT_PATH, JSON.stringify(map, null, 2), "utf8");

const aten = products.filter((p) => /^aten$/i.test(p.vendor || ""));
let mapped = 0;
const missing: string[] = [];
for (const p of aten) {
  const art = normalizeMicroinformArticul("ATEN", p.metadata?.articul || "").toUpperCase();
  const base = art.split("/")[0] || art;
  if (map[art] || map[base]) mapped += 1;
  else if (art) missing.push(art);
}

console.log({
  sitemapUrls: urls.length,
  catalogUrls: catalogUrls.length,
  knownModels: models.length,
  matchedUrls,
  mapSize: Object.keys(map).length,
  atenProducts: aten.length,
  mapped,
  missingCount: missing.length,
  missingSample: missing.slice(0, 40),
  out: OUT_PATH,
});
