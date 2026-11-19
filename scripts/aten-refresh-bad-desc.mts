import { enrichMicroinformProducts } from "../lib/microinform/enrich";
import { readMicroinformProducts } from "../lib/microinform/store";

const products = readMicroinformProducts().filter((p) => /^aten$/i.test(p.vendor || ""));
const bad = products.filter(
  (p) =>
    /<img\b/i.test(p.metadata?.description || "") ||
    /Latest Server Room Solutions Guide/i.test(p.metadata?.description || ""),
);
console.log({ bad: bad.length });
if (!bad.length) process.exit(0);

const result = await enrichMicroinformProducts({
  vendors: ["ATEN"],
  productIds: bad.map((p) => p.id),
  limit: bad.length,
  force: true,
  delayMs: 100,
});
console.log(result);

const sample = readMicroinformProducts().find((p) => p.metadata?.articul === "CS22H");
console.log({
  sampleHasImg: /<img\b/i.test(sample?.metadata?.description || ""),
  preview: (sample?.metadata?.description || "").replace(/\s+/g, " ").slice(0, 260),
});
