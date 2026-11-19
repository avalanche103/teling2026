import { normalizeMicroinformArticul } from "../lib/microinform/articul";
import {
  buildManufacturerIndex,
  lookupManufacturerEntry,
  normalizeManufacturerUrl,
} from "../lib/microinform/manufacturer";
import { enrichMicroinformProducts } from "../lib/microinform/enrich";
import { readMicroinformProducts, writeMicroinformProducts } from "../lib/microinform/store";

const index = await buildManufacturerIndex();
console.log({
  indexTotal: index.entries.length,
  aten: index.entries.filter((e) => e.vendor === "ATEN").length,
});

const products = readMicroinformProducts();
let urlUpdated = 0;

for (let i = 0; i < products.length; i++) {
  const product = products[i]!;
  if (!/^aten$/i.test(product.vendor || "")) continue;
  const articul = normalizeMicroinformArticul("ATEN", product.metadata?.articul || "");
  const entry = lookupManufacturerEntry(index, "ATEN", articul);
  const nextUrl = entry?.url ? normalizeManufacturerUrl(entry.url) : normalizeManufacturerUrl(product.metadata?.url || "");
  if (!nextUrl) continue;
  if (nextUrl !== (product.metadata?.url || "")) {
    urlUpdated += 1;
    products[i] = {
      ...product,
      metadata: {
        ...product.metadata,
        articul,
        url: nextUrl,
      },
    };
  }
}

writeMicroinformProducts(products);
console.log({ urlUpdated });

// Enrich in batches until no more progress.
let totalProcessed = 0;
let totalSucceeded = 0;
let totalImages = 0;
for (let round = 0; round < 4; round++) {
  const result = await enrichMicroinformProducts({
    vendors: ["ATEN"],
    limit: 80,
    onlyMissing: true,
    delayMs: 150,
  });
  console.log(`round ${round + 1}`, result);
  totalProcessed += result.processed;
  totalSucceeded += result.succeeded;
  totalImages += result.imagesDownloaded;
  if (result.processed === 0) break;
}

const after = readMicroinformProducts().filter((p) => /^aten$/i.test(p.vendor || ""));
console.log({
  total: after.length,
  withUrl: after.filter((p) => p.metadata?.url).length,
  modernUrl: after.filter((p) => /\/global\/en\/products\//i.test(p.metadata?.url || "")).length,
  withDesc: after.filter((p) => p.metadata?.description?.trim()).length,
  withPics: after.filter((p) => (p.metadata?.pictures?.length || 0) > 0).length,
  totalProcessed,
  totalSucceeded,
  totalImages,
});
