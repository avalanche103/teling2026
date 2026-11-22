/**
 * Enrich Systeme Electric products from systeme.ru (Russian only).
 *
 * Usage: npx tsx scripts/systeme-ru-enrich.mts
 */
import { enrichProduct } from "../lib/microinform/enrich";
import { lookupSystemeUrl } from "../lib/microinform/manufacturer";
import { readMicroinformProducts, writeMicroinformProducts } from "../lib/microinform/store";

const DELAY_MS = Number(process.env.SYSTEME_RU_DELAY_MS || 200);
const LIMIT = Number(process.env.SYSTEME_RU_LIMIT || 0);

const products = readMicroinformProducts();
const indexes: number[] = [];
for (let i = 0; i < products.length; i++) {
  if (/^systeme/i.test(products[i]?.vendor || "")) indexes.push(i);
}
const targets = LIMIT > 0 ? indexes.slice(0, LIMIT) : indexes;

let matched = 0;
let succeeded = 0;
let failed = 0;
let noUrl = 0;
const errors: Array<{ articul: string; error: string }> = [];

console.log({ total: indexes.length, targets: targets.length });

for (let n = 0; n < targets.length; n++) {
  const idx = targets[n]!;
  const product = products[idx]!;
  const articul = product.metadata?.articul || product.sku;
  const url =
    lookupSystemeUrl(articul) ||
    `https://systeme.ru/product/${encodeURIComponent(String(articul).trim())}`;

  if (!url) {
    noUrl += 1;
    continue;
  }
  matched += 1;

  const result = await enrichProduct(product, {
    pageUrl: url,
    requireCyrillic: true,
  });

  // Always point metadata.url at the RU manufacturer page when enrich succeeded.
  if (result.ok) {
    result.product = {
      ...result.product,
      metadata: {
        ...result.product.metadata,
        url,
      },
    };
    succeeded += 1;
  } else {
    failed += 1;
    errors.push({ articul, error: result.error || "failed" });
  }
  products[idx] = result.product;

  if ((n + 1) % 5 === 0) {
    writeMicroinformProducts(products);
    console.log({ progress: `${n + 1}/${targets.length}`, succeeded, failed, noUrl });
  }
  if (DELAY_MS > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
}

writeMicroinformProducts(products);
console.log({
  matched,
  succeeded,
  failed,
  noUrl,
  errors: errors.slice(0, 20),
});
