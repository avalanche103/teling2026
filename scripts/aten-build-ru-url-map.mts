/**
 * Crawl aten.ru product cards (card?id=N) and build model → URL map.
 * Usage: npx tsx scripts/aten-build-ru-url-map.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { normalizeMicroinformArticul } from "../lib/microinform/articul";
import { MICROINFORM_DIR } from "../lib/microinform/paths";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const OUT_PATH = path.join(MICROINFORM_DIR, "aten-ru-url-map.json");
const ID_START = Number(process.env.ATEN_RU_ID_START || 1000);
const ID_END = Number(process.env.ATEN_RU_ID_END || 12000);
const CONCURRENCY = Number(process.env.ATEN_RU_CONCURRENCY || 24);

function cardUrl(id: number): string {
  return `https://aten.ru/ru/site/card?id=${id}`;
}

function extractModels(html: string, title: string): string[] {
  const models = new Set<string>();
  const pushRaw = (raw: string) => {
    const cleaned = raw.trim().toUpperCase();
    if (!cleaned || cleaned.length < 2) return;
    if (!/^[A-Z0-9][A-Z0-9._/-]*$/i.test(cleaned)) return;
    const norm = normalizeMicroinformArticul("ATEN", cleaned).toUpperCase();
    if (norm) models.add(norm);
    const base = norm.split("/")[0] || norm;
    if (base) models.add(base);
  };

  const artMatch = html.match(/class="value art_card"[^>]*>\s*ATEN\s+([^<]+)</i);
  if (artMatch?.[1]) {
    for (const part of artMatch[1].split(/[,;]/)) {
      const token = part.replace(/^ATEN\s+/i, "").trim().split(/\s+/)[0] || "";
      if (token) pushRaw(token);
    }
  }

  // Title: "ATEN CS22H-AT - ..."
  const titleModel = title.match(/^ATEN\s+([A-Z0-9][A-Z0-9._/-]*)/i)?.[1];
  if (titleModel) pushRaw(titleModel);

  // "Артикул (и возможные варианты...): CS22H-AT (CS22H, CS-22H)."
  const articulBlock = html.match(/Артикул[^:]*:\s*([^<]{5,200})/i)?.[1] || "";
  for (const token of articulBlock.match(/[A-Z0-9][A-Z0-9._/-]{1,24}/gi) || []) {
    pushRaw(token);
  }

  return [...models];
}

async function fetchCard(id: number): Promise<{ id: number; ok: boolean; models: string[] }> {
  const url = cardUrl(id);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "ru-RU,ru;q=0.9",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 404) return { id, ok: false, models: [] };
    if (!res.ok) return { id, ok: false, models: [] };
    const html = await res.text();
    if (/Not Found\s*\(#404\)/i.test(html.slice(0, 2000))) return { id, ok: false, models: [] };
    const title = html.match(/<title>([^<]+)/i)?.[1]?.trim() || "";
    if (!/ATEN/i.test(title)) return { id, ok: false, models: [] };
    const models = extractModels(html, title);
    return { id, ok: models.length > 0, models };
  } catch {
    return { id, ok: false, models: [] };
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (idx < items.length) {
      const cur = items[idx++];
      await worker(cur);
    }
  });
  await Promise.all(runners);
}

if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });

const ids: number[] = [];
for (let id = ID_START; id <= ID_END; id++) ids.push(id);

const map: Record<string, string> = {};
let hitCards = 0;
let checked = 0;

await runPool(ids, CONCURRENCY, async (id) => {
  const result = await fetchCard(id);
  checked += 1;
  if (checked % 500 === 0) {
    console.log({ checked, hitCards, models: Object.keys(map).length });
  }
  if (!result.ok || !result.models.length) return;
  hitCards += 1;
  const url = cardUrl(id);
  for (const model of result.models) {
    const prev = map[model];
    // Prefer shorter card URLs (lower id often = canonical), keep first stable hit.
    if (!prev) map[model] = url;
  }
});

writeFileSync(OUT_PATH, JSON.stringify(map, null, 2), "utf8");

const products = JSON.parse(
  readFileSync(path.join(process.cwd(), "data/products.microinform.json"), "utf8"),
) as Array<{ vendor?: string; metadata?: { articul?: string } }>;
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
  idRange: [ID_START, ID_END],
  checked,
  hitCards,
  models: Object.keys(map).length,
  atenProducts: aten.length,
  mapped,
  missingCount: missing.length,
  missingSample: missing.slice(0, 40),
  out: OUT_PATH,
});
