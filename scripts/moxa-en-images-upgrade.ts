/**
 * Upgrade remaining MOXA cards that still have UA/local photos (no moxa_en_url).
 * Skips accessories / PSU where EN pages are usually missing.
 */
import { writeFileSync } from "fs";
import { enrichMoxaEnglishImages } from "../lib/microinform/enrich";
import {
  readMicroinformProducts,
  writeMicroinformProducts,
} from "../lib/microinform/store";

function isAccessory(articul: string): boolean {
  return /^(CBL|WK-|RK-|DK|M12|CN\d|PWR-|DR-|HDR-|MDR-|DRP|Mini )/i.test(articul);
}

async function main() {
  const products = readMicroinformProducts();
  const indexes: number[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    if (!/moxa/i.test(p.vendor || "")) continue;
    if (p.metadata?.moxa_en_url) continue;
    const a = p.metadata?.articul || "";
    if (isAccessory(a)) continue;
    indexes.push(i);
  }
  console.log("upgrade targets", indexes.length);

  let ok = 0;
  let failed = 0;
  let images = 0;
  for (let n = 0; n < indexes.length; n++) {
    const i = indexes[n]!;
    const p = products[i]!;
    const result = await enrichMoxaEnglishImages(p);
    products[i] = result.product;
    if (result.ok) {
      ok += 1;
      images += result.imagesDownloaded;
      console.log(`[${n + 1}/${indexes.length}] OK ${p.metadata?.articul}`);
    } else {
      failed += 1;
      console.log(`[${n + 1}/${indexes.length}] FAIL ${p.metadata?.articul} ${result.error}`);
    }
    if ((n + 1) % 10 === 0) writeMicroinformProducts(products);
    await new Promise((r) => setTimeout(r, 120));
  }
  writeMicroinformProducts(products);
  const summary = { targets: indexes.length, ok, failed, images };
  writeFileSync("data/microinform/_moxa-en-upgrade.json", JSON.stringify(summary, null, 2));
  console.log(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
