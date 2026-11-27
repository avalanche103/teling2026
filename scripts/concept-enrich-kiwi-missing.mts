/**
 * Re-enrich visible KIWI without description/url (series fallback enabled).
 */
import { enrichConceptProducts } from "../lib/concept/enrich";
import { readConceptProducts } from "../lib/concept/store";

const ids = readConceptProducts()
  .filter(
    (p) =>
      /KIWI/i.test(p.vendor || "") &&
      p.visible !== false &&
      (!p.metadata?.description?.trim() || !(p.metadata?.pictures || []).length),
  )
  .map((p) => p.id);

console.log(`Missing enrich KIWI: ${ids.length}`);
const result = await enrichConceptProducts({
  onlyMissing: true,
  limit: 100,
  delayMs: 200,
  sanitizeFirst: false,
  productIds: ids,
});
console.log(JSON.stringify(result, null, 2));

const p = readConceptProducts().find((x) => x.sku === "920000-00034");
console.log(
  "920000-00034",
  JSON.stringify(
    {
      articul: p?.metadata?.articul,
      url: p?.metadata?.url,
      descLen: (p?.metadata?.description || "").length,
      pics: p?.metadata?.pictures?.length || 0,
    },
    null,
    2,
  ),
);
