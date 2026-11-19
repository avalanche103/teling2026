import { enrichMicroinformProducts } from "../lib/microinform/enrich";
import { readMicroinformProducts } from "../lib/microinform/store";

const products = readMicroinformProducts().filter((p) => /^aten$/i.test(p.vendor || ""));
const targets = products.filter(
  (p) =>
    /aten\.com\/global\/en\/products\//i.test(p.metadata?.url || "") &&
    (!(p.metadata?.pictures?.length > 0) ||
      !p.metadata?.description?.trim() ||
      /Latest Server Room Solutions Guide/i.test(p.metadata?.description || "")),
);
console.log({ total: products.length, targets: targets.length });

const ids = targets.map((p) => p.id);
for (let i = 0; i < ids.length; i += 40) {
  const chunk = ids.slice(i, i + 40);
  const result = await enrichMicroinformProducts({
    vendors: ["ATEN"],
    productIds: chunk,
    limit: chunk.length,
    force: true,
    delayMs: 120,
  });
  console.log(`chunk ${i / 40 + 1}`, {
    processed: result.processed,
    succeeded: result.succeeded,
    failed: result.failed,
    withDescription: result.withDescription,
    imagesDownloaded: result.imagesDownloaded,
    errors: result.errors.slice(0, 5),
  });
}

const after = readMicroinformProducts().filter((p) => /^aten$/i.test(p.vendor || ""));
const sample = after.find((p) => p.metadata?.articul === "CS22H");
console.log({
  withDesc: after.filter((p) => p.metadata?.description?.trim()).length,
  withPics: after.filter((p) => (p.metadata?.pictures?.length || 0) > 0).length,
  sampleDesc: (sample?.metadata?.description || "").replace(/\s+/g, " ").slice(0, 260),
  samplePics: sample?.metadata?.pictures?.length || 0,
});
