import { enrichConceptProducts } from "../lib/concept/enrich";
import { readConceptProducts } from "../lib/concept/store";

const want = new Set(
  (process.argv.slice(2).length
    ? process.argv.slice(2)
    : ["KIWI-4700", "KIWI-432X-VFL", "KIWI-430X-AD", "KIWI-435X-SC", "KIWI-435X-ST"]
  ).map((s) => s.toUpperCase()),
);

const ids = readConceptProducts()
  .filter((p) => want.has(String(p.metadata?.articul || "").toUpperCase()))
  .map((p) => p.id);

console.log("ids", ids);
const result = await enrichConceptProducts({
  onlyMissing: false,
  limit: 20,
  delayMs: 200,
  sanitizeFirst: false,
  productIds: ids,
});
console.log(JSON.stringify(result, null, 2));
for (const a of want) {
  const p = readConceptProducts().find(
    (x) => String(x.metadata?.articul || "").toUpperCase() === a,
  );
  console.log(a, {
    d: (p?.metadata?.description || "").length,
    pics: p?.metadata?.pictures?.length || 0,
    url: (p?.metadata?.url || "").slice(0, 80),
  });
}
