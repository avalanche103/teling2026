/**
 * Full enrich for visible KIWI Concept products.
 * Usage: npx --yes tsx scripts/concept-enrich-kiwi.mts
 */
import { enrichConceptProducts } from "../lib/concept/enrich";
import { readConceptProducts } from "../lib/concept/store";

const ids = readConceptProducts()
  .filter((p) => /KIWI/i.test(p.vendor || "") && p.visible !== false)
  .map((p) => p.id);

console.log(`Enriching ${ids.length} visible KIWI…`);
const result = await enrichConceptProducts({
  onlyMissing: true,
  limit: 200,
  delayMs: 200,
  sanitizeFirst: true,
  productIds: ids,
});
console.log(JSON.stringify(result, null, 2));
