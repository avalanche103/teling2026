import type { ProductRaw } from "@/lib/types";
import { CONCEPT_ID_MIN } from "@/lib/concept/sku";
import {
  readConceptProducts,
  writeConceptProducts,
} from "@/lib/concept/store";
import {
  readMicroinformProducts,
  readSsdSkuSet,
  writeMicroinformProducts,
} from "./store";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { SSD_PRODUCTS_PATH } from "./paths";

function readSsdProducts(): ProductRaw[] {
  if (!existsSync(SSD_PRODUCTS_PATH)) return [];
  const raw = readFileSync(SSD_PRODUCTS_PATH, "utf-8").trim();
  if (!raw || raw.startsWith("version https://git-lfs.github.com/spec/v1")) return [];
  return JSON.parse(raw) as ProductRaw[];
}

function writeSsdProducts(products: ProductRaw[]): void {
  writeFileSync(SSD_PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

export function readAllProductsForAdmin(): ProductRaw[] {
  const ssd = readSsdProducts();
  const microinform = readMicroinformProducts().map((p) => ({
    ...p,
    supplier: p.supplier || ("microinform" as const),
  }));
  const concept = readConceptProducts().map((p) => ({
    ...p,
    supplier: p.supplier || ("concept" as const),
  }));
  return [...ssd, ...microinform, ...concept];
}

export function writeProductUpdate(updated: ProductRaw): void {
  if (updated.supplier === "concept" || updated.id >= CONCEPT_ID_MIN) {
    const products = readConceptProducts();
    const idx = products.findIndex((p) => p.id === updated.id);
    if (idx === -1) throw new Error("Concept product not found");
    products[idx] = { ...updated, supplier: "concept" };
    writeConceptProducts(products);
    return;
  }
  if (updated.supplier === "microinform" || updated.id >= 2_000_000) {
    const products = readMicroinformProducts();
    const idx = products.findIndex((p) => p.id === updated.id);
    if (idx === -1) throw new Error("Microinform product not found");
    products[idx] = { ...updated, supplier: "microinform" };
    writeMicroinformProducts(products);
    return;
  }
  const products = readSsdProducts();
  const idx = products.findIndex((p) => p.id === updated.id);
  if (idx === -1) throw new Error("SSD product not found");
  products[idx] = updated;
  writeSsdProducts(products);
}

export function writeVisibilityUpdates(updatesById: Map<number, boolean>): number {
  let updatedCount = 0;
  const ssd = readSsdProducts();
  const nextSsd = ssd.map((product) => {
    const nextVisible = updatesById.get(product.id);
    if (nextVisible === undefined || product.visible === nextVisible) return product;
    updatedCount += 1;
    return { ...product, visible: nextVisible };
  });
  if (updatedCount) writeSsdProducts(nextSsd);

  const mi = readMicroinformProducts();
  let miChanged = 0;
  const nextMi = mi.map((product) => {
    const nextVisible = updatesById.get(product.id);
    if (nextVisible === undefined || product.visible === nextVisible) return product;
    miChanged += 1;
    return { ...product, visible: nextVisible, supplier: "microinform" as const };
  });
  if (miChanged) writeMicroinformProducts(nextMi);

  const concept = readConceptProducts();
  let conceptChanged = 0;
  const nextConcept = concept.map((product) => {
    const nextVisible = updatesById.get(product.id);
    if (nextVisible === undefined || product.visible === nextVisible) return product;
    conceptChanged += 1;
    return { ...product, visible: nextVisible, supplier: "concept" as const };
  });
  if (conceptChanged) writeConceptProducts(nextConcept);

  return updatedCount + miChanged + conceptChanged;
}

export function deleteProductById(id: number): boolean {
  if (id >= CONCEPT_ID_MIN) {
    const products = readConceptProducts();
    const next = products.filter((p) => p.id !== id);
    if (next.length === products.length) return false;
    writeConceptProducts(next);
    return true;
  }
  if (id >= 2_000_000) {
    const products = readMicroinformProducts();
    const next = products.filter((p) => p.id !== id);
    if (next.length === products.length) return false;
    writeMicroinformProducts(next);
    return true;
  }
  const products = readSsdProducts();
  const next = products.filter((p) => p.id !== id);
  if (next.length === products.length) return false;
  writeSsdProducts(next);
  return true;
}

export function skuExistsAnywhere(sku: string): boolean {
  if (readSsdSkuSet().has(sku)) return true;
  if (readMicroinformProducts().some((p) => p.sku === sku)) return true;
  return readConceptProducts().some((p) => p.sku === sku);
}
