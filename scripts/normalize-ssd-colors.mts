/**
 * Rewrite Цвет characteristic values in products.json to canonical forms.
 */
import { readFileSync, writeFileSync } from "fs";
import {
  isColorCharName,
  normalizeColorValue,
} from "../lib/normalize-color";
import type { ProductRaw } from "../lib/types";

const PATH = "data/products.json";

function main() {
  const products = JSON.parse(readFileSync(PATH, "utf8")) as ProductRaw[];
  let changedItems = 0;
  let droppedItems = 0;
  let productsTouched = 0;
  const fromTo = new Map<string, string>();

  for (const product of products) {
    const groups = product.metadata?.chars;
    if (!groups?.length) continue;
    let touched = false;
    for (const group of groups) {
      const nextItems = [];
      for (const item of group.items || []) {
        if (!isColorCharName(item.name)) {
          nextItems.push(item);
          continue;
        }
        const before = (item.value || "").trim();
        const after = normalizeColorValue(before);
        if (!after) {
          droppedItems += 1;
          touched = true;
          continue;
        }
        if (after !== before) {
          changedItems += 1;
          touched = true;
          fromTo.set(`${before} => ${after}`, `${before} => ${after}`);
        }
        nextItems.push({ ...item, value: after });
      }
      group.items = nextItems;
    }
    if (touched) productsTouched += 1;
  }

  writeFileSync(PATH, `${JSON.stringify(products, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        productsTouched,
        changedItems,
        droppedItems,
        samples: [...fromTo.values()].slice(0, 40),
      },
      null,
      2,
    ),
  );
}

main();
