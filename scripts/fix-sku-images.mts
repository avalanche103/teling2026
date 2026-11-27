/**
 * Wipe and re-download gallery images for one KIWI SKU.
 * Uses fresh filenames (`_g1.webp` / `_g1.jpg`…) to bust browser caches.
 * Usage: npx --yes tsx scripts/fix-sku-images.mts 920000-00034
 */
import { existsSync, readdirSync, unlinkSync, rmSync, statSync, renameSync } from "fs";
import path from "path";
import { enrichConceptProducts } from "../lib/concept/enrich";
import { PUBLIC_IMAGES_DIR } from "../lib/concept/paths";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

const sku = process.argv[2] || "920000-00034";
const products = readConceptProducts();
const product = products.find((p) => p.sku === sku);
if (!product) {
  console.error("SKU not found", sku);
  process.exit(1);
}

for (const f of readdirSync(PUBLIC_IMAGES_DIR)) {
  if (!f.startsWith(`${sku}_`) && !f.startsWith(`${sku}.`)) continue;
  try {
    unlinkSync(path.join(PUBLIC_IMAGES_DIR, f));
    console.log("deleted", f);
  } catch {
    /* ignore */
  }
}

product.metadata.pictures = [];
writeConceptProducts(products);

for (const cacheDir of [".next/cache/images", ".next-dev/cache/images"]) {
  const abs = path.join(process.cwd(), cacheDir);
  if (existsSync(abs)) {
    rmSync(abs, { recursive: true, force: true });
    console.log("cleared", cacheDir);
  }
}

const result = await enrichConceptProducts({
  onlyMissing: false,
  limit: 1,
  delayMs: 0,
  sanitizeFirst: false,
  productIds: [product.id],
});
console.log(JSON.stringify(result, null, 2));

// Rename _{n}.* → _g{n}.* so Next/browser cannot reuse poisoned cache entries.
const updated = readConceptProducts();
const p = updated.find((x) => x.sku === sku)!;
const nextPics: string[] = [];
for (let i = 1; i <= 8; i++) {
  let moved = false;
  for (const ext of ["webp", "jpg", "jpeg", "png"]) {
    const oldName = `${sku}_${i}.${ext}`;
    const newName = `${sku}_g${i}.${ext}`;
    const oldPath = path.join(PUBLIC_IMAGES_DIR, oldName);
    const newPath = path.join(PUBLIC_IMAGES_DIR, newName);
    if (!existsSync(oldPath)) continue;
    try {
      if (existsSync(newPath)) unlinkSync(newPath);
    } catch {
      /* ignore */
    }
    renameSync(oldPath, newPath);
    nextPics.push(`/images/${newName}`);
    moved = true;
    break;
  }
  if (!moved && nextPics.length > 0) break;
}
p.metadata.pictures = nextPics;
writeConceptProducts(updated);

const sharp = (await import("sharp")).default;
for (const f of readdirSync(PUBLIC_IMAGES_DIR).filter((x) => x.startsWith(`${sku}_`))) {
  const fp = path.join(PUBLIC_IMAGES_DIR, f);
  const meta = await sharp(fp).metadata();
  console.log(f, `${meta.width}x${meta.height}`, meta.format, statSync(fp).size);
}
console.log("pictures", nextPics);
