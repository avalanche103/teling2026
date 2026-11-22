/**
 * Pull INFORMIX product photos into public/images and attach to products.microinform.json.
 * Sources: 1k.by (UPS), volti.by (battery + bypass PDU). Onliner CDN blocks hotlink.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
} from "fs";
import path from "path";
import { downloadFileViaCurl } from "../lib/microinform/http-fetch";
import { processMicroinformPackshot } from "../lib/microinform/knockout-bg";
import { PUBLIC_IMAGES_DIR, PRODUCTS_PATH } from "../lib/microinform/paths";
import type { ProductRaw } from "../lib/types";

const ONE_K: Record<string, string[]> = {
  "INF-AIO800": [
    "https://static.1k.by/images/products/ip/big/ppf/7/5247963/ia1bb47fb5.webp",
  ],
  "INF-AIO1000": [
    "https://static.1k.by/images/products/ip/big/pp4/8/5247964/ib021a7d18.webp",
  ],
  "INF-MP1000T": [
    "https://static.1k.by/images/products/ip/big/ppb/5/5247965/i6b4b12866.webp",
    "https://static.1k.by/images/productsimages/ip/big/ppb/5/5247965/i2d41fbb8a.webp",
  ],
  "INF-MP2000T": [
    "https://static.1k.by/images/products/ip/big/pp7/7/5247966/i10d6442b1.webp",
    "https://static.1k.by/images/productsimages/ip/big/pp7/7/5247966/i2f432546c.webp",
  ],
  "INF-MP3000T": [
    "https://static.1k.by/images/products/ip/big/pp4/3/5247967/i7f3704552.webp",
    "https://static.1k.by/images/productsimages/ip/big/pp4/3/5247967/i691f58746.webp",
  ],
  "INF-MP10000RT": [
    "https://static.1k.by/images/products/ip/big/ppb/a/5247992/if504a9c42.webp",
    "https://static.1k.by/images/productsimages/ip/big/ppb/a/5247992/idb77fa8f6.webp",
  ],
  "INF-MP31-RT-6k": [
    "https://static.1k.by/images/products/ip/big/ppf/3/5247993/iaa23a7d1a.webp",
    "https://static.1k.by/images/productsimages/ip/big/ppf/3/5247993/i1e256dc0d.webp",
    "https://static.1k.by/images/productsimages/ip/big/ppf/3/5247993/i083b76915.webp",
  ],
  "INF-MP31-RT-10k": [
    "https://static.1k.by/images/products/ip/big/pp2/b/5247994/i3e9df2f1d.webp",
    "https://static.1k.by/images/productsimages/ip/big/pp2/b/5247994/i9fb4766ae.webp",
    "https://static.1k.by/images/productsimages/ip/big/pp2/b/5247994/i296ce70cd.webp",
  ],
};

const VOLTI_DIRECT: Record<string, string[]> = {
  "INF-BAT20120-MP31": [
    "https://volti.by/wp-content/uploads/inf-bat20120-mp31-angle.webp",
    "https://volti.by/wp-content/uploads/inf-bat20120-mp31-front.webp",
    "https://volti.by/wp-content/uploads/inf-bat20120-mp31-rear.webp",
  ],
  "INF-PDU31-10k-RT": [
    "https://volti.by/wp-content/uploads/inf-pdu31-10k-rt-angle.webp",
    "https://volti.by/wp-content/uploads/inf-pdu31-10k-rt-front.webp",
    "https://volti.by/wp-content/uploads/inf-pdu31-10k-rt-rear.webp",
  ],
};

function clearLocalSkuImages(sku: string) {
  if (!existsSync(PUBLIC_IMAGES_DIR)) return;
  for (const name of readdirSync(PUBLIC_IMAGES_DIR)) {
    if (name.startsWith(`${sku}_`)) {
      try {
        unlinkSync(path.join(PUBLIC_IMAGES_DIR, name));
      } catch {
        /* ignore */
      }
    }
  }
}

async function main() {
  if (!existsSync(PUBLIC_IMAGES_DIR)) mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });

  const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf-8")) as ProductRaw[];
  let updated = 0;
  let downloaded = 0;

  for (const product of products) {
    const vendor = (product.vendor || product.metadata?.brand || "").toUpperCase();
    if (vendor !== "INFORMIX") continue;
    const articul = (product.metadata?.articul || "").trim();
    if (!articul) continue;

    const urls = [...(ONE_K[articul] || []), ...(VOLTI_DIRECT[articul] || [])];
    console.log(product.sku, articul, "candidates", urls.length);
    if (!urls.length) continue;

    clearLocalSkuImages(product.sku);
    const localUrls: string[] = [];
    for (const imageUrl of urls) {
      const ext = path.extname(new URL(imageUrl).pathname) || ".webp";
      const seq = localUrls.length + 1;
      const rawFilename = `${product.sku}_${seq}${ext}`;
      const dest = path.join(PUBLIC_IMAGES_DIR, rawFilename);
      const ok = downloadFileViaCurl(imageUrl, dest);
      if (!ok) {
        console.log("  fail", imageUrl);
        continue;
      }
      let localUrl = `/images/${encodeURIComponent(rawFilename)}`;
      try {
        const webpPath = await processMicroinformPackshot(dest);
        localUrl = `/images/${encodeURIComponent(path.basename(webpPath))}`;
      } catch {
        /* keep raw */
      }
      localUrls.push(localUrl);
      downloaded += 1;
    }

    if (!localUrls.length) continue;
    product.metadata = {
      ...product.metadata,
      pictures: localUrls,
    };
    updated += 1;
    console.log("  ok", localUrls.length, "pics");
  }

  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
  console.log({ updated, downloaded });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
