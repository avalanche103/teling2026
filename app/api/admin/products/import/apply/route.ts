import { NextResponse } from "next/server";
import path from "path";
import { writeFileSync } from "fs";
import type { ProductImportApplyRequest } from "@/lib/types";
import { invalidateProductCaches } from "@/lib/data";
import { saveImportHistoryEntry } from "@/lib/import-history";
import { requireApiSession } from "@/lib/auth";
import {
  PRODUCT_IMPORT_ACTIONS_PATH,
  readImportResultFile,
  runProductImportWorker,
} from "@/lib/product-import-run";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const ACTIONS_PATH = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  PRODUCT_IMPORT_ACTIONS_PATH,
);

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as ProductImportApplyRequest;
    if (!body?.token) {
      return NextResponse.json({ error: "Не передан token предпросмотра" }, { status: 400 });
    }

    writeFileSync(
      ACTIONS_PATH,
      JSON.stringify({
        token: body.token,
        addNewProductKeys: body.addNewProductKeys ?? [],
        conflictActions: body.conflictActions ?? {},
        missingActions: body.missingActions ?? {},
      }),
      "utf-8",
    );

    const worker = await runProductImportWorker("apply");
    if (!worker.ok) {
      return NextResponse.json(
        {
          error: worker.error ?? "Не удалось применить импорт во worker-процессе",
        },
        { status: 500 },
      );
    }

    const result = readImportResultFile();
    invalidateProductCaches();

    await saveImportHistoryEntry({
      filename: result.filename,
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      hiddenCount: result.hiddenCount,
      deletedCount: result.deletedCount,
    });

    return NextResponse.json({
      success: true,
      addedCount: result.addedCount,
      updatedCount: result.updatedCount,
      hiddenCount: result.hiddenCount,
      deletedCount: result.deletedCount,
      totalCount: result.totalCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось применить импорт";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
