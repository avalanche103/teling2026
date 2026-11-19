import { createRequire } from "module";
import path from "path";
import { pathToFileURL } from "url";

// Use tsx-compiled path via dynamic import of built modules is hard;
// run through node --import tsx instead.
const { readCachedPriceBook } = await import("../lib/microinform/price-cache.ts");
const { applyPriceBook, analyzePriceBook } = await import("../lib/microinform/sync.ts");
const { readSectionMap, readSettings } = await import("../lib/microinform/store.ts");
const { classifyProductGroup, sectionIdForGroup } = await import("../lib/microinform/section-hints.ts");
const { normalizeMicroinformArticul } = await import("../lib/microinform/articul.ts");

const book = readCachedPriceBook();
if (!book) throw new Error("No cached price book");

const settings = readSettings();
const sectionMap = readSectionMap();
console.log("enabledVendors", settings.enabledVendors);

const analysis = analyzePriceBook(book, sectionMap);
console.log("analysis counts", analysis.counts);
console.log(
  "ATEN sections",
  analysis.sections.filter((s) => /aten/i.test(s.vendor)).map((s) => ({
    title: s.title,
    products: s.productCount,
    group: s.group,
    mapping: s.mapping,
  })),
);

const enabled = new Set(settings.enabledVendors.map((v) => v.toLowerCase()));
const atenRows = book.products.filter((p) => enabled.has(p.vendor.toLowerCase()) && /^aten$/i.test(p.vendor));
const byGroup = {};
const unresolved = [];
for (const row of atenRows) {
  if (sectionMap[row.sectionTitle]?.action === "skip") continue;
  const group = classifyProductGroup(row.articul, row.name, row.sectionTitle, row.vendor);
  const sectionId = sectionIdForGroup(group);
  byGroup[group] = (byGroup[group] || 0) + 1;
  if (!sectionId || group === "skip") {
    unresolved.push({
      articul: normalizeMicroinformArticul(row.vendor, row.articul),
      name: row.name,
      section: row.sectionTitle,
      group,
    });
  }
}
console.log("group histogram (rows)", byGroup);
console.log("unresolved sample", unresolved.slice(0, 20));
console.log("unresolved count", unresolved.length);

const result = applyPriceBook(book, sectionMap, settings);
console.log("apply", result);
