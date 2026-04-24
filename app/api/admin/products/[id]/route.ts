import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { ProductDocument, ProductRaw, SectionRaw } from "@/lib/types";
import { invalidateProductCaches } from "@/lib/data";
import { requireApiSession } from "@/lib/auth";

const PRODUCTS_PATH = path.join(process.cwd(), "data", "products.json");
const SECTIONS_PATH = path.join(process.cwd(), "data", "sections.json");

function readProducts(): ProductRaw[] {
  return JSON.parse(readFileSync(PRODUCTS_PATH, "utf-8")) as ProductRaw[];
}

function writeProducts(products: ProductRaw[]): void {
  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(SECTIONS_PATH, "utf-8")) as SectionRaw[];
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

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: RouteContext) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }

    const body: Partial<{
      custom_name: string | null;
      brand: string;
      price: number;
      price_without_vat: number;
      section_id: number;
      description?: string;
      picture_url?: string;
      documents?: ProductDocument[];
      visible: boolean;
    }> = await request.json();

    const products = readProducts();
    const idx = products.findIndex((product) => product.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    const current = products[idx];
    const nextSectionId = body.section_id ?? current.section_id;
    const sections = readSections();
    const nextSection = sections.find((section) => section.id === nextSectionId);

    if (!nextSection) {
      return NextResponse.json({ error: "Раздел не найден" }, { status: 400 });
    }

    if (body.price !== undefined && (!Number.isFinite(body.price) || body.price < 0)) {
      return NextResponse.json({ error: "Цена должна быть неотрицательным числом" }, { status: 400 });
    }

    if (body.price_without_vat !== undefined && (!Number.isFinite(body.price_without_vat) || body.price_without_vat < 0)) {
      return NextResponse.json({ error: "Цена без НДС должна быть неотрицательным числом" }, { status: 400 });
    }

    const price = body.price ?? current.price;
    const priceWithoutVat = body.price_without_vat ?? current.price_without_vat;
    const vatAmount = Number(Math.max(0, price - priceWithoutVat).toFixed(2));
    const customName = body.custom_name == null ? null : body.custom_name.trim() || null;
    const brand = body.brand !== undefined ? body.brand.trim() : (current.metadata?.brand || current.vendor || "");

    const description = body.description !== undefined ? body.description.trim() : current.metadata?.description || "";
    const pictureUrl = body.picture_url?.trim();
    const pictures = pictureUrl
      ? [pictureUrl]
      : (current.metadata?.pictures ?? []);
    const documents = body.documents !== undefined
      ? normalizeDocuments(body.documents)
      : (current.metadata?.documents ?? []);

    const updated: ProductRaw = {
      ...current,
      custom_name: customName,
      section_id: nextSection.id,
      section_name: nextSection.name,
      price,
      price_without_vat: priceWithoutVat,
      vat_amount: vatAmount,
      visible: body.visible ?? current.visible,
      metadata: {
        ...current.metadata,
        brand,
        sections: [nextSection.id],
        description,
        pictures,
        documents,
      },
    };

    products[idx] = updated;
    writeProducts(products);
    invalidateProductCaches();

    return NextResponse.json({ success: true, product: updated });
  } catch {
    return NextResponse.json({ error: "Не удалось обновить товар" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }

    const products = readProducts();
    const idx = products.findIndex((product) => product.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    products.splice(idx, 1);
    writeProducts(products);
    invalidateProductCaches();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Не удалось удалить товар" }, { status: 500 });
  }
}