/**
 * Ensure every KIWI product name contains its articul.
 * Usage: npx --yes tsx scripts/fix-kiwi-names.mts
 */
import { ensureNameContainsArticul, nameContainsArticul } from "../lib/concept/build-product";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

const products = readConceptProducts();
let fixed = 0;

for (const product of products) {
  if (!/KIWI/i.test(product.vendor || product.metadata?.brand || "")) continue;
  const articul = product.metadata?.articul || "";
  if (!articul) continue;

  const nextName = ensureNameContainsArticul(product.name || "", articul);
  if (nextName !== product.name) {
    product.name = nextName;
    product.original_name = nextName;
    fixed += 1;
  }

  if (product.custom_name) {
    const nextCustom = ensureNameContainsArticul(product.custom_name, articul);
    if (nextCustom !== product.custom_name) {
      product.custom_name = nextCustom;
      fixed += 1;
    }
  }
}

writeConceptProducts(products);

const visible = products.filter(
  (p) => /KIWI/i.test(p.vendor || "") && p.visible !== false,
);
const stillMissing = visible.filter(
  (p) => !nameContainsArticul(p.custom_name || p.name || "", p.metadata?.articul || ""),
);

console.log(
  JSON.stringify(
    {
      fixed,
      visible: visible.length,
      stillMissing: stillMissing.length,
      sample: visible.slice(0, 5).map((p) => ({
        a: p.metadata?.articul,
        n: (p.custom_name || p.name || "").slice(0, 80),
      })),
    },
    null,
    2,
  ),
);
