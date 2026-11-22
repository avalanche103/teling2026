/**
 * Local RU enrich for INFORMIX (no manufacturer scrape).
 * Also formats weak SVC descriptions that failed manufacturer enrich.
 *
 * Usage: npx tsx scripts/informix-ru-enrich.mts
 */
import { applyLocalUpsEnrich, pickUpsSourceText } from "../lib/microinform/ups-local-enrich";
import { readMicroinformProducts, writeMicroinformProducts } from "../lib/microinform/store";

const products = readMicroinformProducts();
let informix = 0;
let svcFixed = 0;

for (let i = 0; i < products.length; i++) {
  const product = products[i]!;
  const vendor = product.vendor || "";

  if (/^informix$/i.test(vendor)) {
    products[i] = applyLocalUpsEnrich(product);
    informix += 1;
    continue;
  }

  // SVC rows that still lack manufacturer pictures / rich HTML description.
  if (/^svc$/i.test(vendor)) {
    const pics = product.metadata?.pictures?.length || 0;
    const desc = product.metadata?.description || "";
    const hasHtml = /<[a-z][\s\S]*>/i.test(desc);
    const source = pickUpsSourceText(product);
    if (pics === 0 && (!hasHtml || desc.length < 120) && /[А-Яа-яЁё]/.test(source)) {
      const next = applyLocalUpsEnrich(product);
      // Do not overwrite a real svc.ru URL with microinform link.
      if (product.metadata?.url?.includes("svc.ru")) {
        next.metadata = { ...next.metadata, url: product.metadata.url };
      } else {
        next.metadata = { ...next.metadata, url: product.metadata?.url || "" };
      }
      products[i] = next;
      svcFixed += 1;
    }
  }
}

writeMicroinformProducts(products);
console.log({ informix, svcFixed });
