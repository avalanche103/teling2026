import type {
  AdminProductListItem,
  ProductImportConflictItem,
  ProductImportPreview,
  ProductImportPreviewProduct,
  ProductRaw,
} from "@/lib/types";

export const PRODUCT_IMPORT_TMP_PATH = "data/products.import.tmp.json";

interface StoredProductImportSnapshot {
  token: string;
  importedAt: string;
  filename: string;
  products: ProductRaw[];
}

function getProductName(product: ProductRaw): string {
  if (typeof product.custom_name === "string" && product.custom_name.trim()) return product.custom_name.trim();
  if (typeof product.name === "string" && product.name.trim()) return product.name.trim();
  if (typeof product.original_name === "string" && product.original_name.trim()) return product.original_name.trim();
  return "Без названия";
}

function toAdminListItem(product: ProductRaw): AdminProductListItem {
  return {
    id: product.id,
    sku: typeof product.sku === "string" ? product.sku.trim() : "",
    name: getProductName(product),
    originalName: typeof product.original_name === "string" ? product.original_name : "",
    customName: typeof product.custom_name === "string" ? product.custom_name : null,
    sectionId: product.section_id,
    sectionName: product.section_name,
    brand: product.metadata?.brand || product.vendor || "",
    vendor: product.vendor || "",
    price: product.price,
    priceWithoutVat: product.price_without_vat,
    currency: product.currency,
    visible: product.visible !== false,
  };
}

function toPreviewProduct(product: ProductRaw, importKey: string): ProductImportPreviewProduct {
  return {
    importKey,
    id: product.id,
    sku: typeof product.sku === "string" ? product.sku.trim() : "",
    name: getProductName(product),
    sectionName: product.section_name,
    brand: product.metadata?.brand || product.vendor || "",
    price: product.price,
    currency: product.currency,
  };
}

function getImportKey(index: number): string {
  return `import-${index}`;
}

export function parseImportedProducts(data: unknown): ProductRaw[] {
  if (Array.isArray(data)) return data as ProductRaw[];
  if (
    data &&
    typeof data === "object" &&
    "products" in data &&
    Array.isArray((data as { products?: unknown[] }).products)
  ) {
    return (data as { products: ProductRaw[] }).products;
  }
  throw new Error("Ожидается JSON-массив товаров или объект с полем products");
}

export function createStoredImportSnapshot(token: string, filename: string, products: ProductRaw[]): StoredProductImportSnapshot {
  return {
    token,
    filename,
    importedAt: new Date().toISOString(),
    products,
  };
}

export function analyzeProductImport(
  currentProducts: ProductRaw[],
  incomingProducts: ProductRaw[],
  token: string,
  importedAt: string,
): ProductImportPreview {
  const currentById = new Map<number, ProductRaw>();
  const currentBySku = new Map<string, ProductRaw>();

  for (const product of currentProducts) {
    currentById.set(product.id, product);
    const sku = typeof product.sku === "string" ? product.sku.trim() : "";
    if (sku) currentBySku.set(sku, product);
  }

  const incomingIdCounts = new Map<number, number>();
  const incomingSkuCounts = new Map<string, number>();
  for (const product of incomingProducts) {
    incomingIdCounts.set(product.id, (incomingIdCounts.get(product.id) ?? 0) + 1);
    const sku = typeof product.sku === "string" ? product.sku.trim() : "";
    if (sku) incomingSkuCounts.set(sku, (incomingSkuCounts.get(sku) ?? 0) + 1);
  }

  const newProducts: ProductImportPreviewProduct[] = [];
  const conflicts: ProductImportConflictItem[] = [];
  const exactMatchedCurrentIds = new Set<number>();
  const conflictCurrentIds = new Set<number>();
  let exactMatchCount = 0;

  incomingProducts.forEach((incomingProduct, index) => {
    const importKey = getImportKey(index);
    const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";
    const currentSkuMatch = incomingSku ? currentBySku.get(incomingSku) ?? null : null;
    const currentIdMatch = currentById.get(incomingProduct.id) ?? null;
    const duplicateInImport = incomingIdCounts.get(incomingProduct.id)! > 1 || (incomingSku && incomingSkuCounts.get(incomingSku)! > 1);

    if (duplicateInImport) {
      if (currentSkuMatch) conflictCurrentIds.add(currentSkuMatch.id);
      if (currentIdMatch) conflictCurrentIds.add(currentIdMatch.id);
      conflicts.push({
        ...toPreviewProduct(incomingProduct, importKey),
        conflictType: "duplicate",
        currentBySku: currentSkuMatch ? toAdminListItem(currentSkuMatch) : null,
        currentById: currentIdMatch ? toAdminListItem(currentIdMatch) : null,
      });
      return;
    }

    if (currentSkuMatch && currentIdMatch) {
      if (currentSkuMatch.id === currentIdMatch.id) {
        exactMatchCount += 1;
        exactMatchedCurrentIds.add(currentSkuMatch.id);
        return;
      }

      conflictCurrentIds.add(currentSkuMatch.id);
      conflictCurrentIds.add(currentIdMatch.id);
      conflicts.push({
        ...toPreviewProduct(incomingProduct, importKey),
        conflictType: "cross",
        currentBySku: toAdminListItem(currentSkuMatch),
        currentById: toAdminListItem(currentIdMatch),
      });
      return;
    }

    if (currentSkuMatch) {
      conflictCurrentIds.add(currentSkuMatch.id);
      conflicts.push({
        ...toPreviewProduct(incomingProduct, importKey),
        conflictType: "sku",
        currentBySku: toAdminListItem(currentSkuMatch),
        currentById: null,
      });
      return;
    }

    if (currentIdMatch) {
      conflictCurrentIds.add(currentIdMatch.id);
      conflicts.push({
        ...toPreviewProduct(incomingProduct, importKey),
        conflictType: "id",
        currentBySku: null,
        currentById: toAdminListItem(currentIdMatch),
      });
      return;
    }

    newProducts.push(toPreviewProduct(incomingProduct, importKey));
  });

  const missingProducts = currentProducts
    .filter((product) => !exactMatchedCurrentIds.has(product.id) && !conflictCurrentIds.has(product.id))
    .map((product) => ({
      currentKey: `current-${product.id}`,
      product: toAdminListItem(product),
    }));

  return {
    token,
    importedAt,
    currentCount: currentProducts.length,
    incomingCount: incomingProducts.length,
    exactMatchCount,
    newProducts,
    conflicts,
    missingProducts,
  };
}

export function mergeImportedIntoCurrent(currentProduct: ProductRaw, incomingProduct: ProductRaw): ProductRaw {
  return {
    ...incomingProduct,
    id: currentProduct.id,
    sku: currentProduct.sku,
    visible: currentProduct.visible,
    custom_name: currentProduct.custom_name,
    price_override: currentProduct.price_override,
  };
}

export type ProductImportSnapshot = StoredProductImportSnapshot;
