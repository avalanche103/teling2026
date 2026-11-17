import { readFileSync, writeFileSync } from "fs";
import {
  refineActiveNetworkChars,
  resolveActiveNetworkGroup,
  SELECTED_FILTERS_BY_GROUP,
  type ActiveNetworkGroup,
} from "../lib/microinform/chars";
import { CATALOG_SECTION_IDS } from "../lib/microinform/section-hints";
import type { ProductRaw, SectionRaw } from "../lib/types";

const PRODUCTS_PATH = "data/products.microinform.json";
const SECTIONS_PATH = "data/sections.json";

function main() {
  const products = JSON.parse(readFileSync(PRODUCTS_PATH, "utf8")) as ProductRaw[];
  const sections = JSON.parse(readFileSync(SECTIONS_PATH, "utf8")) as SectionRaw[];

  const refinedByGroup: Record<string, number> = {};
  let refined = 0;

  for (const product of products) {
    const group = resolveActiveNetworkGroup(product);
    if (!group) continue;

    const priceSection =
      (product.metadata as { price_section?: string }).price_section ||
      product.section_name ||
      "";

    product.metadata.chars = refineActiveNetworkChars(
      group,
      priceSection,
      product.name,
      product.metadata?.articul || "",
      product.metadata.chars,
    );
    refined += 1;
    refinedByGroup[group] = (refinedByGroup[group] || 0) + 1;
  }

  const sectionIdToGroup = new Map<number, ActiveNetworkGroup>(
    (Object.entries(CATALOG_SECTION_IDS) as Array<[ActiveNetworkGroup, number]>).map(
      ([group, id]) => [id, group],
    ),
  );

  let sectionsUpdated = 0;
  for (const section of sections) {
    const group = sectionIdToGroup.get(section.id);
    if (!group) continue;
    const filters = SELECTED_FILTERS_BY_GROUP[group];
    section.metadata.selected_filters = [...filters];
    sectionsUpdated += 1;
  }

  writeFileSync(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`);
  writeFileSync(SECTIONS_PATH, `${JSON.stringify(sections, null, 2)}\n`);
  console.log(JSON.stringify({ refined, refinedByGroup, sectionsUpdated }, null, 2));
}

main();
