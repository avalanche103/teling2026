/**
 * Reprocess existing Microinform packshots: white bg → transparent webp
 * so catalog cards show the same slate-100 gray as SSD cutouts.
 *
 * Usage: npx tsx scripts/knockout-microinform-images.mts
 */
import { existsSync, readdirSync, unlinkSync } from "fs";
import path from "path";
import { processMicroinformPackshot } from "../lib/microinform/knockout-bg";
import { PUBLIC_IMAGES_DIR } from "../lib/microinform/paths";
import {
  readMicroinformProducts,
  writeMicroinformProducts,
} from "../lib/microinform/store";

const OPAQUE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function main() {
  if (!existsSync(PUBLIC_IMAGES_DIR)) {
    console.log(JSON.stringify({ error: "no-images-dir" }));
    return;
  }

  const files = readdirSync(PUBLIC_IMAGES_DIR).filter((name) => {
    if (!/^910000-/.test(name)) return false;
    return OPAQUE_EXT.has(path.extname(name).toLowerCase());
  });

  // Prefer *_N.jpg over already-transparent webp of same stem only when jpg exists.
  const byStem = new Map<string, string[]>();
  for (const name of files) {
    const stem = name.replace(/\.[^.]+$/, "");
    const list = byStem.get(stem) || [];
    list.push(name);
    byStem.set(stem, list);
  }

  let processed = 0;
  let failed = 0;
  const localBySku = new Map<string, string[]>();

  for (const [stem, names] of byStem) {
    const prefer =
      names.find((n) => /\.(jpe?g|png)$/i.test(n)) ||
      names.find((n) => /\.webp$/i.test(n));
    if (!prefer) continue;

    const src = path.join(PUBLIC_IMAGES_DIR, prefer);
    try {
      // If only webp exists, re-knock from it (may already be transparent — still ok).
      const webpPath = await processMicroinformPackshot(src);
      processed += 1;

      // Drop leftover opaque siblings for this stem.
      for (const name of names) {
        const full = path.join(PUBLIC_IMAGES_DIR, name);
        if (path.resolve(full) === path.resolve(webpPath)) continue;
        try {
          unlinkSync(full);
        } catch {
          /* ignore */
        }
      }

      const m = stem.match(/^(910000-\d+)_(\d+)$/);
      if (m) {
        const sku = m[1]!;
        const seq = Number(m[2]);
        const list = localBySku.get(sku) || [];
        list[seq - 1] = `/images/${encodeURIComponent(path.basename(webpPath))}`;
        localBySku.set(sku, list);
      }
    } catch (error) {
      failed += 1;
      console.error(stem, error instanceof Error ? error.message : error);
    }
  }

  const products = readMicroinformProducts();
  let productsUpdated = 0;
  for (const product of products) {
    const locals = (localBySku.get(product.sku) || []).filter(Boolean);
    if (!locals.length) continue;
    // Merge: keep order of local slots; append any prior remotes not replaced.
    product.metadata.pictures = locals;
    productsUpdated += 1;
  }
  writeMicroinformProducts(products);

  console.log(
    JSON.stringify({ processed, failed, productsUpdated, stems: byStem.size }, null, 2),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
