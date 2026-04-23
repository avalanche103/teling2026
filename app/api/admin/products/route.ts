import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { AdminProductListItem, ProductRaw } from "@/lib/types";
import { invalidateProductCaches } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATA_PATH = path.join(process.cwd(), "data", "products.json");

function readProducts(): ProductRaw[] {
  return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as ProductRaw[];
}

function writeProducts(products: ProductRaw[]): void {
  writeFileSync(DATA_PATH, JSON.stringify(products, null, 2), "utf-8");
}

function isVisible(product: ProductRaw): boolean {
  return product.visible !== false;
}

function getProductName(product: ProductRaw): string {
  if (typeof product.custom_name === "string" && product.custom_name.trim()) return product.custom_name.trim();
  if (typeof product.name === "string" && product.name.trim()) return product.name.trim();
  if (typeof product.original_name === "string" && product.original_name.trim()) return product.original_name.trim();
  return "Без названия";
}

function applyFilters(products: ProductRaw[], query: string, sectionId: number | null): ProductRaw[] {
  let next = products;

  if (Number.isFinite(sectionId) && sectionId != null) {
    next = next.filter((product) => product.section_id === sectionId);
  }

  if (query) {
    next = next.filter((product) => {
      const haystack = [
        String(product.id),
        typeof product.sku === "string" ? product.sku : "",
        typeof product.name === "string" ? product.name : "",
        typeof product.original_name === "string" ? product.original_name : "",
        typeof product.custom_name === "string" ? product.custom_name : "",
        product.section_name || "",
        product.metadata?.brand || product.vendor || "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  return next;
}

function toListItem(product: ProductRaw): AdminProductListItem {
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
    visible: isVisible(product),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query")?.trim().toLowerCase() ?? "";
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
    const sectionIdParam = searchParams.get("sectionId");
    const sectionId = sectionIdParam ? parseInt(sectionIdParam, 10) : null;

    let products = applyFilters(readProducts(), query, sectionId);

    products.sort((a, b) => {
      const bySection = (a.section_name || "").localeCompare(b.section_name || "", "ru");
      if (bySection !== 0) return bySection;
      const byName = getProductName(a).localeCompare(getProductName(b), "ru");
      if (byName !== 0) return byName;
      return a.id - b.id;
    });

    const total = products.length;
    const start = (page - 1) * limit;
    const items = products.slice(start, start + limit).map(toListItem);

    return NextResponse.json(
      { items, total, page, limit },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать товары" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body: {
      updates?: Array<{ id: number; visible: boolean }>;
      bulk?: { visible: boolean; query?: string; sectionId?: number | null };
    } = await request.json();
    const updates = Array.isArray(body.updates) ? body.updates : [];

    if (body.bulk && typeof body.bulk.visible === "boolean") {
      const query = typeof body.bulk.query === "string" ? body.bulk.query.trim().toLowerCase() : "";
      const sectionId = typeof body.bulk.sectionId === "number" ? body.bulk.sectionId : null;
      const products = readProducts();
      const matchedIds = new Set(applyFilters(products, query, sectionId).map((product) => product.id));

      if (matchedIds.size === 0) {
        return NextResponse.json({ error: "Нет товаров для изменения" }, { status: 400 });
      }

      let updatedCount = 0;
      const nextProducts = products.map((product) => {
        if (!matchedIds.has(product.id)) return product;
        if (isVisible(product) === body.bulk!.visible) return product;

        updatedCount += 1;
        return {
          ...product,
          visible: body.bulk!.visible,
        };
      });

      writeProducts(nextProducts);
      invalidateProductCaches();
      return NextResponse.json({ success: true, updatedCount });
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Нет изменений для сохранения" }, { status: 400 });
    }

    const updatesById = new Map<number, boolean>();
    for (const update of updates) {
      if (!Number.isInteger(update.id) || typeof update.visible !== "boolean") continue;
      updatesById.set(update.id, update.visible);
    }

    if (updatesById.size === 0) {
      return NextResponse.json({ error: "Некорректный формат изменений" }, { status: 400 });
    }

    const products = readProducts();
    let updatedCount = 0;

    const nextProducts = products.map((product) => {
      const nextVisible = updatesById.get(product.id);
      if (nextVisible === undefined) return product;
      if (product.visible === nextVisible) return product;

      updatedCount += 1;
      return {
        ...product,
        visible: nextVisible,
      };
    });

    writeProducts(nextProducts);
    invalidateProductCaches();

    return NextResponse.json({ success: true, updatedCount });
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить видимость товаров" }, { status: 500 });
  }
}