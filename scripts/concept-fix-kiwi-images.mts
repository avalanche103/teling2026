/**
 * Clear blurry/tiny KIWI images, patch URL map, re-enrich missing/bad.
 */
import { existsSync, readFileSync, statSync, unlinkSync, writeFileSync } from "fs";
import path from "path";
import { enrichConceptProducts } from "../lib/concept/enrich";
import { KIWI_URL_MAP_PATH, PUBLIC_IMAGES_DIR } from "../lib/concept/paths";
import { readConceptProducts, writeConceptProducts } from "../lib/concept/store";

const MIN = 8000;

const map = JSON.parse(readFileSync(KIWI_URL_MAP_PATH, "utf-8")) as Record<string, string>;
map["KIWI-4300"] =
  "https://www.kiwitest.ru/product/izmeritelnoe-oborudovanie/izmeriteli-opticheskoy-moshchnosti/izmeritel_opticheskoy_moshchnosti_kiwi_4300/";
map["KIWI-4301"] =
  "https://www.kiwitest.ru/product/izmeritelnoe-oborudovanie/izmeriteli-opticheskoy-moshchnosti/izmeritel_opticheskoy_moshchnosti_kiwi_4301/";
map["KIWI-4320"] =
  "https://www.kiwitest.ru/product/izmeritelnoe-oborudovanie/izmeriteli-opticheskoy-moshchnosti/izmeritel_opticheskoy_moshchnosti_kiwi_4320_1/";
map["KIWI-4321"] =
  "https://www.kiwitest.ru/product/izmeritelnoe-oborudovanie/izmeriteli-opticheskoy-moshchnosti/izmeritel_opticheskoy_moshchnosti_kiwi_4321_tsvetnoy_displey_ot_50_do_20db_1/";
map["KIWI-432X-VFL"] = map["KIWI-4320"];
writeFileSync(KIWI_URL_MAP_PATH, JSON.stringify(map, null, 2), "utf-8");

const products = readConceptProducts();
const reIds: number[] = [];
let clearedPics = 0;
let clearedFiles = 0;

for (const p of products) {
  if (!/KIWI/i.test(p.vendor || "") || p.visible === false) continue;
  const pics = p.metadata?.pictures || [];
  const keep: string[] = [];
  let hadTiny = false;
  for (const pic of pics) {
    if (!pic.startsWith("/images/")) continue;
    const fp = path.join(PUBLIC_IMAGES_DIR, pic.replace(/^\/images\//, ""));
    try {
      if (!existsSync(fp) || statSync(fp).size < MIN) {
        hadTiny = true;
        clearedFiles += 1;
        try {
          if (existsSync(fp)) unlinkSync(fp);
        } catch {
          /* ignore */
        }
        continue;
      }
      keep.push(pic);
    } catch {
      hadTiny = true;
    }
  }
  const wrongUrl =
    /kiwi_4201|istochnik_opticheskogo_signala_kiwi_420/i.test(p.metadata?.url || "") &&
    /^KIWI-43/i.test(p.metadata?.articul || "");
  const needDesc = !p.metadata?.description?.trim();
  const needPics = keep.length === 0;
  if (hadTiny || wrongUrl || needDesc || needPics) {
    if (hadTiny || wrongUrl) {
      p.metadata.pictures = [];
      clearedPics += 1;
      if (wrongUrl) p.metadata.url = "";
    } else {
      p.metadata.pictures = keep;
    }
    reIds.push(p.id);
  }
}

writeConceptProducts(products);
console.log({ clearedPics, clearedFiles, reIds: reIds.length });

const result = await enrichConceptProducts({
  onlyMissing: true,
  limit: 200,
  delayMs: 200,
  sanitizeFirst: false,
  productIds: reIds,
});
console.log(JSON.stringify(result, null, 2));

const again = readConceptProducts();
const x = again.find((i) => i.sku === "920000-00034");
const sizes = (x?.metadata?.pictures || []).map((pic) => {
  const fp = path.join(PUBLIC_IMAGES_DIR, pic.replace(/^\/images\//, ""));
  return existsSync(fp) ? statSync(fp).size : 0;
});
console.log("920000-00034", {
  url: x?.metadata?.url?.slice(0, 90),
  descLen: (x?.metadata?.description || "").length,
  pics: x?.metadata?.pictures,
  sizes,
});

const missing = again.filter(
  (p) =>
    /KIWI/i.test(p.vendor || "") &&
    p.visible !== false &&
    (!p.metadata?.description?.trim() || !(p.metadata?.pictures || []).length),
);
console.log(
  "still missing",
  missing.length,
  missing.map((m) => m.metadata?.articul),
);
