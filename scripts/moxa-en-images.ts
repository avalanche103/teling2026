/**
 * Replace MOXA product photos from moxa.com (EN). Keeps Russian descriptions.
 */
import { writeFileSync } from "fs";
import { enrichMoxaEnglishImages } from "../lib/microinform/enrich";
import {
  readMicroinformProducts,
  writeMicroinformProducts,
} from "../lib/microinform/store";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : 250;
  const onlyMissing = process.argv.includes("--only-missing");

  const products = readMicroinformProducts();
  const indexes: number[] = [];
  for (let i = 0; i < products.length; i++) {
    const p = products[i]!;
    if (!/moxa/i.test(p.vendor || "")) continue;
    const en = (p.metadata?.moxa_en_url || "").replace(/\/+$/, "").toLowerCase();
    const soft =
      !en ||
      en.endsWith("/en/products") ||
      en.endsWith("/products") ||
      en.includes("/en/search");
    const hasPics = (p.metadata?.pictures?.length || 0) > 0;
    if (onlyMissing && hasPics && !soft) continue;
    indexes.push(i);
  }

  const targets = indexes.slice(0, Math.max(1, limit));
  console.log("targets", targets.length, "of", indexes.length);

  let ok = 0;
  let failed = 0;
  let images = 0;
  const errors: Array<{ articul: string; error: string }> = [];

  for (let n = 0; n < targets.length; n++) {
    const i = targets[n]!;
    const p = products[i]!;
    const result = await enrichMoxaEnglishImages(p);
    products[i] = result.product;
    if (result.ok) {
      ok += 1;
      images += result.imagesDownloaded;
      console.log(
        `[${n + 1}/${targets.length}] OK ${p.metadata?.articul} imgs=${result.imagesDownloaded} ${result.pageUrl}`,
      );
    } else {
      failed += 1;
      errors.push({ articul: p.metadata?.articul || p.sku, error: result.error || "failed" });
      console.log(`[${n + 1}/${targets.length}] FAIL ${p.metadata?.articul} ${result.error}`);
    }
    if ((n + 1) % 10 === 0) writeMicroinformProducts(products);
    await new Promise((r) => setTimeout(r, 150));
  }

  writeMicroinformProducts(products);

  const moxa = products.filter((p) => /moxa/i.test(p.vendor || ""));
  const withPics = moxa.filter((p) => (p.metadata?.pictures?.length || 0) > 0).length;
  const withEn = moxa.filter((p) => Boolean(p.metadata?.moxa_en_url)).length;
  const summary = {
    processed: targets.length,
    ok,
    failed,
    images,
    withPics,
    withEn,
    total: moxa.length,
    errors: errors.slice(0, 40),
  };
  writeFileSync("data/microinform/_moxa-en-images-result.json", JSON.stringify(summary, null, 2));
  console.log(summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
