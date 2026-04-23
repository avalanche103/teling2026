import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { ProductRaw } from "@/lib/types";
import {
  PRODUCT_IMPORT_TMP_PATH,
  analyzeProductImport,
  createStoredImportSnapshot,
  parseImportedProducts,
} from "@/lib/product-import";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PRODUCTS_PATH = path.join(process.cwd(), "data", "products.json");
const TMP_PATH = path.join(process.cwd(), PRODUCT_IMPORT_TMP_PATH);

function readCurrentProducts(): ProductRaw[] {
  return JSON.parse(readFileSync(PRODUCTS_PATH, "utf-8")) as ProductRaw[];
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл JSON не передан" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const incomingProducts = parseImportedProducts(parsed);
    const token = crypto.randomUUID();
    const snapshot = createStoredImportSnapshot(token, file.name, incomingProducts);

    writeFileSync(TMP_PATH, JSON.stringify(snapshot, null, 2), "utf-8");

    const preview = analyzeProductImport(readCurrentProducts(), incomingProducts, snapshot.token, snapshot.importedAt);
    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проанализировать импорт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
