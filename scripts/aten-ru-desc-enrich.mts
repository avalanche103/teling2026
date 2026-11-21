/**
 * Re-enrich ATEN product descriptions from Russian sources (aten.ru → atenpro.ru).
 * Keeps existing English manufacturer URLs and local pictures untouched.
 *
 * Usage: npx tsx scripts/aten-ru-desc-enrich.mts
 */
import { enrichProduct } from "../lib/microinform/enrich";
import { lookupAtenRussianUrl } from "../lib/microinform/manufacturer";
import { readMicroinformProducts, writeMicroinformProducts } from "../lib/microinform/store";

const DELAY_MS = Number(process.env.ATEN_RU_DELAY_MS || 120);
const LIMIT = Number(process.env.ATEN_RU_LIMIT || 0);

const products = readMicroinformProducts();
const atenIndexes: number[] = [];
for (let i = 0; i < products.length; i++) {
  if (/^aten$/i.test(products[i]?.vendor || "")) atenIndexes.push(i);
}

const targets = LIMIT > 0 ? atenIndexes.slice(0, LIMIT) : atenIndexes;

let matchedAtenRu = 0;
let matchedAtenpro = 0;
let leftEn = 0;
let succeeded = 0;
let failed = 0;
let picsPreserved = 0;
const errors: Array<{ articul: string; source?: string; error: string }> = [];

console.log({ totalAten: atenIndexes.length, targets: targets.length });

for (let n = 0; n < targets.length; n++) {
  const idx = targets[n]!;
  const product = products[idx]!;
  const articul = product.metadata?.articul || product.sku;
  const picsBefore = product.metadata?.pictures?.length || 0;
  const hit = lookupAtenRussianUrl(articul);

  if (!hit) {
    leftEn += 1;
    continue;
  }
  if (hit.source === "aten.ru") matchedAtenRu += 1;
  else matchedAtenpro += 1;

  const result = await enrichProduct(product, {
    pageUrl: hit.url,
    descriptionOnly: true,
    requireCyrillic: true,
  });
  products[idx] = result.product;

  const picsAfter = result.product.metadata?.pictures?.length || 0;
  if (picsBefore > 0 && picsAfter === picsBefore) picsPreserved += 1;

  if (result.ok) succeeded += 1;
  else {
    failed += 1;
    errors.push({
      articul,
      source: hit.source,
      error: result.error || "failed",
    });
  }

  if ((n + 1) % 20 === 0) {
    writeMicroinformProducts(products);
    console.log({
      progress: `${n + 1}/${targets.length}`,
      succeeded,
      failed,
      leftEn,
    });
  }

  if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
}

writeMicroinformProducts(products);

const after = readMicroinformProducts().filter((p) => /^aten$/i.test(p.vendor || ""));
const withCyr = after.filter((p) =>
  /[А-Яа-яЁё]/.test(
    (p.metadata?.description || "").replace(/<[^>]+>/g, " "),
  ),
).length;
const withPics = after.filter((p) => (p.metadata?.pictures?.length || 0) > 0).length;

const samples = ["CS22H", "UC232A", "CL5708N", "CL5708"];
for (const art of samples) {
  const p = after.find(
    (x) => String(x.metadata?.articul || "").toUpperCase().startsWith(art),
  );
  if (!p) {
    console.log({ sample: art, found: false });
    continue;
  }
  const text = (p.metadata?.description || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  console.log({
    sample: art,
    articul: p.metadata?.articul,
    pics: p.metadata?.pictures?.length || 0,
    cyrillic: /[А-Яа-яЁё]/.test(text),
    desc: text.slice(0, 220),
  });
}

console.log({
  matchedAtenRu,
  matchedAtenpro,
  leftEn,
  succeeded,
  failed,
  picsPreserved,
  afterWithCyrillic: withCyr,
  afterWithPics: withPics,
  errors: errors.slice(0, 25),
});
