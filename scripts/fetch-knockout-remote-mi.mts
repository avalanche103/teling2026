/**
 * Download remote Microinform pictures that were never saved locally,
 * knock out white backgrounds, point metadata at /images/*.webp.
 */
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "fs";
import path from "path";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { processMicroinformPackshot } from "../lib/microinform/knockout-bg";
import { PUBLIC_IMAGES_DIR } from "../lib/microinform/paths";
import {
  readMicroinformProducts,
  writeMicroinformProducts,
} from "../lib/microinform/store";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname).toLowerCase();
    if (ext && ext.length <= 10) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

async function download(url: string, dest: string): Promise<boolean> {
  const attempt = async (target: string) => {
    const res = await fetch(target, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok || !res.body) return false;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
    return true;
  };
  try {
    if (await attempt(url)) return true;
  } catch {
    /* www fallback */
  }
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./i, "") !== "dlink.ru") return false;
    if (u.hostname.startsWith("www.")) return false;
    u.hostname = "www.dlink.ru";
    return await attempt(u.toString());
  } catch {
    return false;
  }
}

async function main() {
  if (!existsSync(PUBLIC_IMAGES_DIR)) {
    mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
  }

  const products = readMicroinformProducts();
  let updated = 0;
  let images = 0;
  let failed = 0;

  for (const product of products) {
    const pics = product.metadata.pictures || [];
    const first = pics[0] || "";
    if (!/^https?:\/\//i.test(first)) continue;

    const localUrls: string[] = [];
    for (const url of pics.slice(0, 8)) {
      if (!/^https?:\/\//i.test(url)) continue;
      const seq = localUrls.length + 1;
      const raw = path.join(
        PUBLIC_IMAGES_DIR,
        `${product.sku}_${seq}${extensionFromUrl(url)}`,
      );
      const ok = await download(url, raw);
      if (!ok) {
        failed += 1;
        continue;
      }
      try {
        const webp = await processMicroinformPackshot(raw);
        localUrls.push(`/images/${encodeURIComponent(path.basename(webp))}`);
        images += 1;
      } catch {
        try {
          unlinkSync(raw);
        } catch {
          /* ignore */
        }
        failed += 1;
      }
    }

    if (localUrls.length) {
      product.metadata.pictures = localUrls;
      updated += 1;
    }
  }

  writeMicroinformProducts(products);
  console.log(JSON.stringify({ updated, images, failed }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
