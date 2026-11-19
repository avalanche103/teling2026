import fs from "fs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36";

const res = await fetch("https://www.aten.com/sitemap.xml", {
  headers: { "User-Agent": UA, Accept: "application/xml,text/xml,*/*" },
  signal: AbortSignal.timeout(60000),
});
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const xml = await res.text();

const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1].trim());
const productUrls = locs.filter((u) =>
  /\/global\/en\/products\/.+\/[a-z0-9][a-z0-9._-]+\/?$/i.test(u),
);

const map = {};
for (const url of productUrls) {
  const clean = url.endsWith("/") ? url : `${url}/`;
  const parts = clean.split("/").filter(Boolean);
  const model = (parts[parts.length - 1] || "").toUpperCase();
  if (!model) continue;
  // Prefer shorter/cleaner paths if duplicates.
  if (!map[model] || clean.length < map[model].length) map[model] = clean;
}

fs.writeFileSync(
  "data/microinform/aten-url-map.json",
  JSON.stringify(map, null, 2),
  "utf8",
);

const products = JSON.parse(fs.readFileSync("data/products.microinform.json", "utf8"));
const aten = products.filter((p) => /^aten$/i.test(p.vendor || ""));
let hit = 0;
const missing = [];
for (const p of aten) {
  const art = String(p.metadata?.articul || "").toUpperCase();
  const base = art.split("/")[0];
  if (map[art] || map[base]) hit += 1;
  else missing.push(art);
}
console.log({
  sitemapUrls: locs.length,
  productUrls: productUrls.length,
  models: Object.keys(map).length,
  atenProducts: aten.length,
  mapped: hit,
  missingSample: missing.slice(0, 30),
  missingCount: missing.length,
});
