/**
 * Remove Concept logos / site banners from all KIWI galleries, renumber survivors,
 * then re-enrich SKUs that ended up with no product photos.
 *
 * Usage: npx --yes tsx scripts/concept-clean-kiwi-images.mts
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import path from "path";
import sharp from "sharp";
import {
  enrichConceptProducts,
  isJunkDownloadedImage,
} from "../lib/concept/enrich";
import { PUBLIC_IMAGES_DIR } from "../lib/concept/paths";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

function isKiwi(p: { vendor?: string; metadata?: { brand?: string } }): boolean {
  const brand = `${p.vendor || ""} ${p.metadata?.brand || ""}`.toUpperCase();
  return brand.includes("KIWI");
}

function listSkuFiles(sku: string): string[] {
  if (!existsSync(PUBLIC_IMAGES_DIR)) return [];
  return readdirSync(PUBLIC_IMAGES_DIR)
    .filter((f) => f.startsWith(`${sku}_`) || f === `${sku}.jpg` || f === `${sku}.webp`)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function safeUnlink(fp: string) {
  for (let i = 0; i < 5; i++) {
    try {
      if (existsSync(fp)) unlinkSync(fp);
      return;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

const products = readConceptProducts();
const kiwi = products.filter(isKiwi);
let deleted = 0;
let rewritten = 0;
const needEnrichIds: number[] = [];

for (const product of kiwi) {
  const sku = product.sku;
  const keptBufs: Array<{ ext: string; buf: Buffer; w: number; h: number; size: number }> = [];

  for (const f of listSkuFiles(sku)) {
    const fp = path.join(PUBLIC_IMAGES_DIR, f);
    try {
      const buf = readFileSync(fp);
      const size = buf.length;
      const meta = await sharp(buf).metadata();
      if (isJunkDownloadedImage(meta.width || 0, meta.height || 0, size)) {
        safeUnlink(fp);
        deleted += 1;
        console.log("delete junk", f, `${meta.width}x${meta.height}`, size);
        continue;
      }
      keptBufs.push({
        ext: path.extname(f) || ".jpg",
        buf,
        w: meta.width || 0,
        h: meta.height || 0,
        size,
      });
    } catch {
      safeUnlink(fp);
      deleted += 1;
      console.log("delete unreadable", f);
    }
  }

  // Wipe all current files for this SKU, then write contiguous _1…
  for (const f of listSkuFiles(sku)) {
    safeUnlink(path.join(PUBLIC_IMAGES_DIR, f));
  }

  const finalPics: string[] = [];
  for (let i = 0; i < keptBufs.length; i++) {
    const toName = `${sku}_${i + 1}${keptBufs[i].ext}`;
    writeFileSync(path.join(PUBLIC_IMAGES_DIR, toName), keptBufs[i].buf);
    finalPics.push(`/images/${toName}`);
    rewritten += 1;
  }

  product.metadata = {
    ...product.metadata,
    pictures: finalPics,
  };

  if (finalPics.length === 0) {
    needEnrichIds.push(product.id);
  }
}

writeConceptProducts(products);
console.log(
  JSON.stringify(
    {
      kiwi: kiwi.length,
      deleted,
      rewritten,
      needEnrich: needEnrichIds.length,
      needEnrichSample: needEnrichIds.slice(0, 40),
    },
    null,
    2,
  ),
);

if (needEnrichIds.length) {
  console.log("re-enriching", needEnrichIds.length, "SKUs without photos…");
  const result = await enrichConceptProducts({
    onlyMissing: false,
    limit: needEnrichIds.length,
    delayMs: 250,
    sanitizeFirst: false,
    productIds: needEnrichIds,
  });
  console.log(JSON.stringify(result, null, 2));
}

const check = listSkuFiles("920000-00033");
console.log("920000-00033 files", check);
for (const f of check) {
  const fp = path.join(PUBLIC_IMAGES_DIR, f);
  const meta = await sharp(readFileSync(fp)).metadata();
  console.log(f, `${meta.width}x${meta.height}`, meta.format, statSync(fp).size);
}
