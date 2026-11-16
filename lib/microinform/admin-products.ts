import type { ProductRaw } from "@/lib/types";
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
  return [...ssd, ...microinform];
}

export function writeProductUpdate(updated: ProductRaw): void {
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
  return updatedCount + miChanged;
}

export function deleteProductById(id: number): boolean {
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
  return readMicroinformProducts().some((p) => p.sku === sku);
}
