/**
 * Apply Concept KIWI+EXFO caches to products.concept.json
 * Usage: npx --yes tsx scripts/concept-apply.mts
 */
import { applyConceptCatalog, analyzeFromCaches } from "../lib/concept/sync";
import { readCachedKiwiPriceBook } from "../lib/concept/price-cache";

const analysis = analyzeFromCaches();
const result = applyConceptCatalog({
  kiwiBook: readCachedKiwiPriceBook(),
  sectionMapInput: analysis.sectionMap,
  settingsPatch: analysis.settings,
});
console.log(JSON.stringify(result, null, 2));
