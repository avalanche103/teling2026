/**
 * Reprocess Concept (KIWI/EXFO) packshots: white/black bg → transparent webp.
 * Copies via temp dir to avoid Windows locks from the Next dev server.
 *
 * Usage: npx --yes tsx scripts/concept-knockout-images.mts
 */
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import path from "path";
import sharp from "sharp";
import { processMicroinformPackshot } from "../lib/microinform/knockout-bg";
import { PUBLIC_IMAGES_DIR } from "../lib/concept/paths";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

const OPAQUE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function alreadyTransparent(filePath: string): Promise<boolean> {
  try {
    const buf = readFileSync(filePath);
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Sample 4 corners — if alpha already 0, skip.
    const corners = [
      0,
      (info.width - 1) * 4,
      (info.height - 1) * info.width * 4,
      ((info.height - 1) * info.width + (info.width - 1)) * 4,
    ];
    return corners.every((o) => (data[o + 3] ?? 255) < 16);
  } catch {
    return false;
  }
}

async function main() {
  if (!existsSync(PUBLIC_IMAGES_DIR)) {
    console.log(JSON.stringify({ error: "no-images-dir" }));
    return;
  }

  const work = mkdtempSync(path.join(tmpdir(), "teling-knock-"));
  const files = readdirSync(PUBLIC_IMAGES_DIR).filter((name) => {
    if (!/^920000-/.test(name)) return false;
    if (/_tmp\d|\.knockout\.tmp|\.raw\.bin/i.test(name)) return false;
    return OPAQUE_EXT.has(path.extname(name).toLowerCase());
  });

  const byStem = new Map<string, string[]>();
  for (const name of files) {
    const stem = name.replace(/\.[^.]+$/, "");
    const list = byStem.get(stem) || [];
    list.push(name);
    byStem.set(stem, list);
  }

  let processed = 0;
  let skipped = 0;
  let failed = 0;
  const localBySku = new Map<string, string[]>();

  for (const [stem, names] of byStem) {
    const prefer =
      names.find((n) => /\.(jpe?g|png)$/i.test(n)) ||
      names.find((n) => /\.webp$/i.test(n));
    if (!prefer) continue;

    const src = path.join(PUBLIC_IMAGES_DIR, prefer);
    try {
      if (await alreadyTransparent(src)) {
        skipped += 1;
        const m = stem.match(/^(920000-\d+)_(?:g)?(\d+)$/);
        if (m) {
          const sku = m[1]!;
          const seq = Number(m[2]);
          const list = localBySku.get(sku) || [];
          list[seq - 1] = `/images/${encodeURIComponent(path.basename(src).replace(/\.[^.]+$/, ".webp"))}`;
          // Prefer actual existing webp name
          const webpName = prefer.replace(/\.(jpe?g|png)$/i, ".webp");
          const webpExists = existsSync(path.join(PUBLIC_IMAGES_DIR, webpName));
          list[seq - 1] = `/images/${encodeURIComponent(webpExists ? webpName : prefer)}`;
          localBySku.set(sku, list);
        }
        continue;
      }

      const tmpIn = path.join(work, prefer);
      copyFileSync(src, tmpIn);
      const webpTmp = await processMicroinformPackshot(tmpIn);
      const outName = `${stem}.webp`;
      const outPath = path.join(PUBLIC_IMAGES_DIR, outName);
      writeFileSync(outPath, readFileSync(webpTmp));

      for (const name of names) {
        if (name === outName) continue;
        try {
          unlinkSync(path.join(PUBLIC_IMAGES_DIR, name));
        } catch {
          /* ignore */
        }
      }
      try {
        unlinkSync(webpTmp);
      } catch {
        /* ignore */
      }
      try {
        if (existsSync(tmpIn)) unlinkSync(tmpIn);
      } catch {
        /* ignore */
      }

      processed += 1;
      const m = stem.match(/^(920000-\d+)_(?:g)?(\d+)$/);
      if (m) {
        const sku = m[1]!;
        const seq = Number(m[2]);
        const list = localBySku.get(sku) || [];
        list[seq - 1] = `/images/${encodeURIComponent(outName)}`;
        localBySku.set(sku, list);
      }
    } catch (error) {
      failed += 1;
      console.error(stem, error instanceof Error ? error.message : error);
    }
  }

  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const products = readConceptProducts();
  let productsUpdated = 0;
  for (const product of products) {
    const locals = (localBySku.get(product.sku) || []).filter(Boolean);
    if (!locals.length) continue;
    product.metadata.pictures = locals;
    productsUpdated += 1;
  }
  writeConceptProducts(products);

  console.log(
    JSON.stringify(
      { processed, skipped, failed, productsUpdated, stems: byStem.size },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
