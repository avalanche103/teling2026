import { refineActiveNetworkChars, resolveActiveNetworkGroup } from "../lib/microinform/chars";
import { normalizeMicroinformArticul } from "../lib/microinform/articul";
import { readMicroinformProducts, writeMicroinformProducts } from "../lib/microinform/store";

const products = readMicroinformProducts();
let updated = 0;

for (let i = 0; i < products.length; i++) {
  const product = products[i]!;
  if (!/^aten$/i.test(product.vendor || "")) continue;
  const group = resolveActiveNetworkGroup(product);
  if (!group) continue;
  const articul = normalizeMicroinformArticul(
    product.vendor || "ATEN",
    product.metadata?.articul || "",
  );
  const priceSection =
    typeof product.metadata?.price_section === "string"
      ? product.metadata.price_section
      : "";
  const chars = refineActiveNetworkChars(
    group,
    priceSection || product.section_name || "",
    product.name,
    articul,
    product.metadata?.chars,
  );
  products[i] = {
    ...product,
    metadata: {
      ...product.metadata,
      articul,
      chars,
    },
  };
  updated += 1;
}

writeMicroinformProducts(products);
console.log({ updated });
