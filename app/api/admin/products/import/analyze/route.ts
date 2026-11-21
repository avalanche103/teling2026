import { NextResponse } from "next/server";
import path from "path";
import { existsSync, writeFileSync } from "fs";
import { requireApiSession } from "@/lib/auth";
import {
  PRODUCT_IMPORT_UPLOAD_PATH,
  readImportPreviewFile,
  runProductImportWorker,
} from "@/lib/product-import-run";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const UPLOAD_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  PRODUCT_IMPORT_UPLOAD_PATH,
);

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
      } else {
        return NextResponse.json({ error: "Неизвестный источник анализа" }, { status: 400 });
      }
    } else {
      const formData = await request.formData();
      const file = formData.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Файл JSON не передан" }, { status: 400 });
      }

      // Persist upload to disk; parsing happens in a separate worker process.
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(UPLOAD_PATH, buffer);
    }

    const worker = await runProductImportWorker("analyze");
    if (!worker.ok) {
      return NextResponse.json(
        {
          error:
            worker.error ??
            "Не удалось проанализировать импорт во worker-процессе",
        },
        { status: 500 },
      );
    }

    const preview = readImportPreviewFile();
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
          ? "Не хватает памяти на сервере для разбора JSON. Используйте «Анализ файла на сервере» (после SCP) — разбор идёт в отдельном процессе."
          : message,
      },
      { status: 500 },
    );
  }
}
