import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { AdminProductListItem, ProductDocument, ProductRaw, SectionRaw } from "@/lib/types";
import { invalidateProductCaches } from "@/lib/data";
import { requireApiSession } from "@/lib/auth";

const SECTIONS_PATH = path.join(process.cwd(), "data", "sections.json");

function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(SECTIONS_PATH, "utf-8")) as SectionRaw[];
}

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
    picture: product.metadata?.pictures?.[0] || null,
    description: product.metadata?.description || "",
    documents: product.metadata?.documents || [],
  };
}

function normalizeDocuments(input: unknown): ProductDocument[] {
  if (!Array.isArray(input)) return [];
  const items = input
    .map((doc) => {
      if (!doc || typeof doc !== "object") return null;
      const d = doc as Partial<ProductDocument>;
      const type = typeof d.type === "string" ? d.type.trim() : "";
      const name = typeof d.name === "string" ? d.name.trim() : "";
      const url = typeof d.url === "string" ? d.url.trim() : "";
      if (!name || !url) return null;
      return {
        type: type || "Документ",
        name,
        url,
      } satisfies ProductDocument;
    })
    .filter((doc): doc is ProductDocument => Boolean(doc));

  return items.slice(0, 50);
}

export async function GET(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
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
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
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

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const body: {
      name: string;
      sku: string;
      brand?: string;
      section_id: number;
      price: number;
      price_without_vat: number;
      description?: string;
      picture_url?: string;
      documents?: ProductDocument[];
      visible?: boolean;
    } = await request.json();

    const nameTrimmed = body.name?.trim() ?? "";
    const skuTrimmed = body.sku?.trim() ?? "";

    if (!nameTrimmed) {
      return NextResponse.json({ error: "Название обязательно" }, { status: 400 });
    }
    if (!skuTrimmed) {
      return NextResponse.json({ error: "SKU обязателен" }, { status: 400 });
    }
    if (!Number.isInteger(body.section_id)) {
      return NextResponse.json({ error: "Выберите раздел" }, { status: 400 });
    }
    if (!Number.isFinite(body.price) || body.price < 0) {
      return NextResponse.json({ error: "Цена должна быть неотрицательным числом" }, { status: 400 });
    }
    if (!Number.isFinite(body.price_without_vat) || body.price_without_vat < 0) {
      return NextResponse.json({ error: "Цена без НДС должна быть неотрицательным числом" }, { status: 400 });
    }

    const products = readProducts();

    if (products.some((p) => p.sku === skuTrimmed)) {
      return NextResponse.json({ error: `SKU "${skuTrimmed}" уже используется` }, { status: 409 });
    }

    const sections = readSections();
    const section = sections.find((s) => s.id === body.section_id);
    if (!section) {
      return NextResponse.json({ error: "Раздел не найден" }, { status: 400 });
    }

    const maxId = products.reduce((max, p) => Math.max(max, p.id), 0);
    const newId = maxId + 1;

    const price = body.price;
    const priceWithoutVat = body.price_without_vat;
    const vatAmount = Number(Math.max(0, price - priceWithoutVat).toFixed(2));
    const brand = (body.brand ?? "").trim();

    const newProduct: ProductRaw = {
      id: newId,
      name: nameTrimmed,
      original_name: nameTrimmed,
      custom_name: null,
      sku: skuTrimmed,
      visible: body.visible ?? true,
      section_id: section.id,
      section_name: section.name,
      price,
      calculated_price: price,
      price_override: null,
      price_without_vat: priceWithoutVat,
      vat_amount: vatAmount,
      currency: "Br",
      currency_code: "BYN",
      vendor: brand,
      metadata: {
        articul: skuTrimmed,
        type: "",
        url: "",
        sections: [section.id],
        brand,
        unit: "шт",
        minQty: 1,
        multiplicity: 1,
        timeDelivery: "",
        weight: 0,
        volume: 0,
        updated: new Date().toISOString(),
        pictures: (body.picture_url?.trim()) ? [body.picture_url.trim()] : [],
        video: [],
        documents: normalizeDocuments(body.documents),
        zamena: [],
        analog: [],
        soputst: [],
        chars: [],
        description: (body.description?.trim()) || "",
      },
    };

    products.push(newProduct);
    writeProducts(products);
    invalidateProductCaches();

    return NextResponse.json({ success: true, product: newProduct }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось создать товар" }, { status: 500 });
  }
}