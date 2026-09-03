import { NextResponse } from "next/server";
import path from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import type { ProductRaw } from "@/lib/types";
import {
  PRODUCT_IMPORT_TMP_PATH,
  analyzeProductImport,
  createStoredImportSnapshot,
  parseImportedProducts,
} from "@/lib/product-import";
import { requireApiSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const PRODUCTS_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "products.json"
);
const TMP_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  PRODUCT_IMPORT_TMP_PATH
);
export const PRODUCT_IMPORT_UPLOAD_PATH = "data/products.import.upload.json";
const UPLOAD_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  PRODUCT_IMPORT_UPLOAD_PATH
);

function readCurrentProducts(): ProductRaw[] {
  return JSON.parse(readFileSync(PRODUCTS_PATH, "utf-8")) as ProductRaw[];
}

function analyzeFromText(text: string, filename: string) {
  const parsed = JSON.parse(text) as unknown;
  const incomingProducts = parseImportedProducts(parsed);
  const token = crypto.randomUUID();
  const snapshot = createStoredImportSnapshot(token, filename, incomingProducts);

  // Compact JSON — no indent (saves ~30–50% disk/RAM on 100MB catalogs).
  writeFileSync(TMP_PATH, JSON.stringify(snapshot), "utf-8");

  const preview = analyzeProductImport(
    readCurrentProducts(),
    incomingProducts,
    snapshot.token,
    snapshot.importedAt,
  );
  return preview;
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get("content-type") ?? "";

    // Analyze a file already on the server (SCP / SSD export) — avoids 100MB browser upload.
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as { source?: string } | null;
      if (body?.source === "server") {
        if (!existsSync(UPLOAD_PATH)) {
          return NextResponse.json(
            {
              error:
                "Файл data/products.import.upload.json на сервере не найден. Загрузите его по SCP, затем повторите.",
            },
            { status: 400 },
          );
        }
        const text = readFileSync(UPLOAD_PATH, "utf-8");
        const preview = analyzeFromText(text, "products.import.upload.json");
        return NextResponse.json(preview, {
          headers: { "Cache-Control": "no-store, max-age=0" },
        });
      }
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл JSON не передан" }, { status: 400 });
    }

    // Persist upload to disk first, then parse — reduces peak memory vs holding FormData + strings.
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(UPLOAD_PATH, buffer);
    const preview = analyzeFromText(buffer.toString("utf-8"), file.name);

    return NextResponse.json(preview, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось проанализировать импорт";
    const isOom =
      /heap|allocation failed|out of memory|ENOMEM/i.test(message) ||
      (error instanceof Error && error.name === "RangeError");
    return NextResponse.json(
      {
        error: isOom
          ? "Не хватает памяти на сервере для разбора JSON (~100 MB). Загрузите файл по SCP в data/products.import.upload.json и нажмите «Анализ файла на сервере»."
          : message,
      },
      { status: 500 },
    );
  }
}
