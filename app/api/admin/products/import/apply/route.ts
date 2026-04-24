import { NextResponse } from "next/server";
import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type {
  ProductImportApplyRequest,
  ProductImportConflictAction,
  ProductImportMissingAction,
  ProductRaw,
} from "@/lib/types";
import {
  PRODUCT_IMPORT_TMP_PATH,
  analyzeProductImport,
  mergeImportedIntoCurrent,
  type ProductImportSnapshot,
} from "@/lib/product-import";
import { invalidateProductCaches } from "@/lib/data";
import { saveImportHistoryEntry } from "@/lib/import-history";
import { requireApiSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRODUCTS_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "products.json"
);
const TMP_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  PRODUCT_IMPORT_TMP_PATH
);

function readCurrentProducts(): ProductRaw[] {
  return JSON.parse(readFileSync(PRODUCTS_PATH, "utf-8")) as ProductRaw[];
}

function writeProducts(products: ProductRaw[]): void {
  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

function readSnapshot(): ProductImportSnapshot | null {
  if (!existsSync(TMP_PATH)) return null;
  return JSON.parse(readFileSync(TMP_PATH, "utf-8")) as ProductImportSnapshot;
}

function setProductById(products: ProductRaw[], id: number, nextProduct: ProductRaw): void {
  const index = products.findIndex((product) => product.id === id);
  if (index >= 0) {
    products[index] = nextProduct;
  }
}

function getCurrentById(products: ProductRaw[], id: number): ProductRaw | undefined {
  return products.find((product) => product.id === id);
}

function getCurrentBySku(products: ProductRaw[], sku: string): ProductRaw | undefined {
  return products.find((product) => (typeof product.sku === "string" ? product.sku.trim() : "") === sku);
}

function applyMissingAction(products: ProductRaw[], id: number, action: ProductImportMissingAction): ProductRaw[] {
  if (action === "delete") {
    return products.filter((product) => product.id !== id);
  }

  if (action === "hide") {
    return products.map((product) => (product.id === id ? { ...product, visible: false } : product));
  }

  return products;
}

function resolveConflictTarget(
  products: ProductRaw[],
  incomingProduct: ProductRaw,
  action: ProductImportConflictAction,
): ProductRaw | null {
  const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";

  if (action === "use-sku" && incomingSku) {
    return getCurrentBySku(products, incomingSku) ?? null;
  }

  if (action === "use-id") {
    return getCurrentById(products, incomingProduct.id) ?? null;
  }

  return null;
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as ProductImportApplyRequest;
    const snapshot = readSnapshot();

    if (!snapshot || snapshot.token !== body.token) {
      return NextResponse.json({ error: "Предпросмотр импорта устарел. Загрузите JSON заново." }, { status: 400 });
    }

    let products = readCurrentProducts();
    const preview = analyzeProductImport(products, snapshot.products, snapshot.token, snapshot.importedAt);
    const newKeysToAdd = new Set(body.addNewProductKeys ?? []);
    const conflictActions = body.conflictActions ?? {};
    const missingActions = body.missingActions ?? {};
    const conflictKeySet = new Set(preview.conflicts.map((item) => item.importKey));
    const newKeySet = new Set(preview.newProducts.map((item) => item.importKey));
    const incomingByKey = new Map(snapshot.products.map((product, index) => [`import-${index}`, product]));

    let addedCount = 0;
    let updatedCount = 0;
    let hiddenCount = 0;
    let deletedCount = 0;

    snapshot.products.forEach((incomingProduct, index) => {
      const importKey = `import-${index}`;
      if (conflictKeySet.has(importKey) || newKeySet.has(importKey)) return;

      const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";
      const currentProduct = incomingSku
        ? getCurrentBySku(products, incomingSku) ?? getCurrentById(products, incomingProduct.id)
        : getCurrentById(products, incomingProduct.id);

      if (!currentProduct) return;
      setProductById(products, currentProduct.id, mergeImportedIntoCurrent(currentProduct, incomingProduct));
      updatedCount += 1;
    });

    for (const previewItem of preview.newProducts) {
      if (!newKeysToAdd.has(previewItem.importKey)) continue;
      const incomingProduct = incomingByKey.get(previewItem.importKey);
      if (!incomingProduct) continue;

      products.push({
        ...incomingProduct,
        visible: incomingProduct.visible ?? true,
      });
      addedCount += 1;
    }

    for (const conflict of preview.conflicts) {
      const action = conflictActions[conflict.importKey] ?? "skip";
      if (action === "skip") continue;

      const incomingProduct = incomingByKey.get(conflict.importKey);
      if (!incomingProduct) continue;

      const target = resolveConflictTarget(products, incomingProduct, action);
      if (!target) continue;

      setProductById(products, target.id, mergeImportedIntoCurrent(target, incomingProduct));
      updatedCount += 1;
    }

    for (const missingItem of preview.missingProducts) {
      const action = missingActions[missingItem.currentKey] ?? "keep";
      const beforeLength = products.length;
      const beforeVisible = getCurrentById(products, missingItem.product.id)?.visible !== false;
      products = applyMissingAction(products, missingItem.product.id, action);

      if (action === "delete" && products.length < beforeLength) {
        deletedCount += 1;
      }

      if (action === "hide") {
        const afterVisible = getCurrentById(products, missingItem.product.id)?.visible !== false;
        if (beforeVisible && !afterVisible) hiddenCount += 1;
      }
    }

    writeProducts(products);
    invalidateProductCaches();

    // Log the import to history
    await saveImportHistoryEntry({
      filename: snapshot.filename,
      addedCount,
      updatedCount,
      hiddenCount,
      deletedCount,
    });

    return NextResponse.json({
      success: true,
      addedCount,
      updatedCount,
      hiddenCount,
      deletedCount,
      totalCount: products.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось применить импорт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
