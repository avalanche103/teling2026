import { readMicroinformProducts } from "../lib/microinform/store";

const vendors = ["SVC", "INFORMIX", "Systeme Electric"] as const;
const products = readMicroinformProducts().filter((p) =>
  vendors.some((v) => v.toLowerCase() === (p.vendor || "").toLowerCase()),
);

function hasCyrillic(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text);
}

type Row = {
  vendor: string;
  total: number;
  cyrDesc: number;
  htmlDesc: number;
  longDesc: number;
  withPics: number;
  withUrl: number;
  withParams: number;
};

const rows: Row[] = [];
for (const vendor of vendors) {
  const list = products.filter((p) => (p.vendor || "").toLowerCase() === vendor.toLowerCase());
  const row: Row = {
    vendor,
    total: list.length,
    cyrDesc: 0,
    htmlDesc: 0,
    longDesc: 0,
    withPics: 0,
    withUrl: 0,
    withParams: 0,
  };
  for (const p of list) {
    const desc = p.metadata?.description || "";
    const text = desc.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (hasCyrillic(text)) row.cyrDesc += 1;
    if (/<[a-z][\s\S]*>/i.test(desc)) row.htmlDesc += 1;
    if (text.length >= 120) row.longDesc += 1;
    if ((p.metadata?.pictures?.length || 0) > 0) row.withPics += 1;
    if ((p.metadata?.url || "").trim()) row.withUrl += 1;
    if ((p.metadata?.chars || []).some((g) => g.name === "Параметры" && g.items.length > 0)) {
      row.withParams += 1;
    }
  }
  rows.push(row);
}

console.log(JSON.stringify({ total: products.length, rows }, null, 2));

const weak = products
  .filter((p) => {
    const desc = (p.metadata?.description || "").replace(/<[^>]+>/g, " ").trim();
    return !hasCyrillic(desc) || desc.length < 40;
  })
  .map((p) => ({ vendor: p.vendor, articul: p.metadata?.articul, descLen: (p.metadata?.description || "").length }));
console.log("weak", weak);

const noPicBrand = products
  .filter((p) => /^systeme|^svc$/i.test(p.vendor || "") && !(p.metadata?.pictures?.length || 0))
  .map((p) => ({ vendor: p.vendor, articul: p.metadata?.articul, url: p.metadata?.url || "" }));
console.log("systeme/svc without pics", noPicBrand.length, noPicBrand.slice(0, 20));
