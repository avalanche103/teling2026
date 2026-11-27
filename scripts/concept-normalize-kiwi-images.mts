/**
 * Re-encode KIWI local images to real JPEG and bust Next image cache.
 */
import {
  existsSync,
  readdirSync,
  statSync,
  unlinkSync,
  rmSync,
  writeFileSync,
} from "fs";
import path from "path";
import sharp from "sharp";
import { PUBLIC_IMAGES_DIR } from "../lib/concept/paths";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

const MIN = 8000;

function isKiwiSku(sku: string): boolean {
  return /^920000-/.test(sku);
}

const products = readConceptProducts();
const kiwiSkus = new Set(
  products
    .filter((p) => /KIWI/i.test(p.vendor || "") && typeof p.sku === "string")
    .map((p) => p.sku),
);

let converted = 0;
let removed = 0;

for (const sku of kiwiSkus) {
  const files = readdirSync(PUBLIC_IMAGES_DIR).filter((f) =>
    f.startsWith(`${sku}_`),
  );
  // Group by index
  const byIndex = new Map<number, string[]>();
  for (const f of files) {
    const m = f.match(new RegExp(`^${sku}_(\\d+)\\.(.+)$`, "i"));
    if (!m) continue;
    const idx = Number(m[1]);
    const list = byIndex.get(idx) || [];
    list.push(f);
    byIndex.set(idx, list);
  }

  const keepPics: string[] = [];
  for (const idx of [...byIndex.keys()].sort((a, b) => a - b)) {
    const variants = byIndex.get(idx) || [];
    // Prefer largest file as source
    variants.sort(
      (a, b) =>
        statSync(path.join(PUBLIC_IMAGES_DIR, b)).size -
        statSync(path.join(PUBLIC_IMAGES_DIR, a)).size,
    );
    const source = variants[0];
    const srcPath = path.join(PUBLIC_IMAGES_DIR, source);
    const destName = `${sku}_${idx}.jpg`;
    const destPath = path.join(PUBLIC_IMAGES_DIR, destName);
    const tmp = `${destPath}.tmp.jpg`;
    try {
      await sharp(srcPath)
        .rotate()
        .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 90, mozjpeg: true })
        .toFile(tmp);
      if (existsSync(tmp) && statSync(tmp).size >= MIN) {
        try {
          if (existsSync(destPath)) unlinkSync(destPath);
        } catch {
          /* ignore */
        }
        const { renameSync } = await import("fs");
        renameSync(tmp, destPath);
        keepPics.push(`/images/${destName}`);
        converted += 1;
      }
    } catch {
      /* skip broken */
    }
    try {
      if (existsSync(tmp)) unlinkSync(tmp);
    } catch {
      /* ignore */
    }

    // Remove non-jpg variants for this index
    for (const f of variants) {
      if (f === destName) continue;
      try {
        unlinkSync(path.join(PUBLIC_IMAGES_DIR, f));
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }

  const product = products.find((p) => p.sku === sku);
  if (product && keepPics.length) {
    product.metadata.pictures = keepPics;
  }
}

writeConceptProducts(products);

// Bust Next.js image optimizer cache
for (const cacheDir of [".next/cache/images", ".next-dev/cache/images"]) {
  const abs = path.join(process.cwd(), cacheDir);
  if (existsSync(abs)) {
    try {
      rmSync(abs, { recursive: true, force: true });
      console.log("cleared", cacheDir);
    } catch (e) {
      console.log("cache clear failed", cacheDir, e);
    }
  }
}

const sample = readdirSync(PUBLIC_IMAGES_DIR)
  .filter((f) => f.startsWith("920000-00034_"))
  .map((f) => ({ f, size: statSync(path.join(PUBLIC_IMAGES_DIR, f)).size }));

console.log({ converted, removed, sample });
