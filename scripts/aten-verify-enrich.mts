import { readMicroinformProducts } from "../lib/microinform/store";
import { buildManufacturerIndex } from "../lib/microinform/manufacturer";
import { enrichMicroinformProducts } from "../lib/microinform/enrich";
import { verifyManufacturerProducts } from "../lib/microinform/verify";

async function main() {
  const products = readMicroinformProducts().filter((p) =>
    /^aten$/i.test(p.vendor || ""),
  );
  const bySec: Record<string, number> = {};
  for (const p of products) {
    const k = `${p.section_id} ${p.section_name}`;
    bySec[k] = (bySec[k] || 0) + 1;
  }
  console.log("ATEN products", products.length);
  console.log(bySec);
  console.log("with url", products.filter((p) => p.metadata?.url).length);

  console.log("building index...");
  const index = await buildManufacturerIndex();
  console.log(
    "index total",
    index.entries.length,
    "aten",
    index.entries.filter((e) => e.vendor === "ATEN").length,
  );

  console.log("verify ATEN...");
  const v = await verifyManufacturerProducts({
    vendors: ["ATEN"],
    limit: 200,
    rebuildIndex: false,
    updateMedia: true,
    delayMs: 150,
  });
  console.log({
    processed: v.processed,
    urlUpdated: v.urlUpdated,
    nameUpdated: v.nameUpdated,
    enriched: v.enriched,
    unresolved: v.unresolved,
    failed: v.failed,
    indexSize: v.indexSize,
    errors: v.errors.slice(0, 15),
    samples: v.samples.slice(0, 8),
  });

  console.log("enrich remaining...");
  const e = await enrichMicroinformProducts({
    vendors: ["ATEN"],
    limit: 120,
    onlyMissing: true,
    delayMs: 150,
  });
  console.log(e);

  const after = readMicroinformProducts().filter((p) =>
    /^aten$/i.test(p.vendor || ""),
  );
  console.log("after enrich with description", after.filter((p) => p.metadata?.description?.trim()).length);
  console.log("after enrich with pictures", after.filter((p) => (p.metadata?.pictures?.length || 0) > 0).length);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
