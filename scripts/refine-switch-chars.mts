import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import {
  isSwitchProduct,
  refineSwitchCharGroups,
} from "../lib/microinform/switch-chars";
import type { ProductCharGroup, ProductRaw } from "../lib/types";

const PATH = "data/products.microinform.json";

function syntheticGroup(chars: ProductCharGroup[] | undefined) {
  return (chars || []).find(
    (g) =>
      g.name === "Характеристики" &&
      g.items.some((i) => i.name === "Управление" || i.name === "PoE"),
  );
}

function main() {
  const current = JSON.parse(readFileSync(PATH, "utf8")) as ProductRaw[];
  const head = JSON.parse(
    execSync("git show HEAD:data/products.microinform.json", {
      encoding: "utf8",
      maxBuffer: 200 * 1024 * 1024,
    }),
  ) as ProductRaw[];
  const headBySku = new Map(head.map((p) => [p.sku, p]));

  let restored = 0;
  let refined = 0;

  for (const product of current) {
    if (!isSwitchProduct(product)) continue;

    const prev = headBySku.get(product.sku);
    const prevSynth = syntheticGroup(prev?.metadata?.chars);
    const enrichRest = (product.metadata.chars || []).filter((g) => {
      if (g.name !== "Характеристики") return true;
      return !g.items.some(
        (i) => i.name === "Управление" || i.name === "PoE" || i.name === "Uplink",
      );
    });

    // Start from HEAD synthetic (pre-change) + current manufacturer groups.
    const baseChars = prevSynth ? [prevSynth, ...enrichRest] : product.metadata.chars;
    if (prevSynth) restored += 1;

    const priceSection =
      (product.metadata as { price_section?: string }).price_section ||
      (prev?.metadata as { price_section?: string } | undefined)?.price_section ||
      "";

    product.metadata.chars = refineSwitchCharGroups(
      priceSection || product.section_name || "Коммутаторы",
      product.name,
      product.metadata?.articul || "",
      baseChars,
    );
    refined += 1;
  }

  writeFileSync(PATH, `${JSON.stringify(current, null, 2)}\n`);
  console.log(JSON.stringify({ restored, refined }));
}

main();
