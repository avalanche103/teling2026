/**
 * Enrich Concept products (sanitize junk first).
 * Usage: npx --yes tsx scripts/concept-enrich.mts [limit]
 */
import { enrichConceptProducts } from "../lib/concept/enrich";

const limit = Number(process.argv[2] || 40);
console.log(`Enriching up to ${limit} products…`);
const result = await enrichConceptProducts({
  onlyMissing: true,
  limit,
  delayMs: 200,
  sanitizeFirst: true,
});
console.log(JSON.stringify(result, null, 2));
