import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { cacheKiwiPriceFile } from "@/lib/concept/price-cache";
import { analyzeFromCaches } from "@/lib/concept/sync";
import { readSections, writeSettings, readSettings } from "@/lib/concept/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Нужен файл прайса KIWI (.xls/.xlsx)" }, { status: 400 });
    }

    const rateRaw = form.get("usdToBynRate");
    const markupRaw = form.get("markupPercent");
    const current = readSettings();
    const usdToBynRate =
      typeof rateRaw === "string" && Number.isFinite(Number(rateRaw)) && Number(rateRaw) > 0
        ? Number(rateRaw)
        : current.usdToBynRate;
    const markupPercent =
      typeof markupRaw === "string" && Number.isFinite(Number(markupRaw))
        ? Math.max(0, Number(markupRaw))
        : current.markupPercent;
    writeSettings({ ...current, usdToBynRate, markupPercent });

    const buffer = Buffer.from(await file.arrayBuffer());
    const book = cacheKiwiPriceFile(buffer, file.name || "KIWI Pricelist.xls");
    const analysis = analyzeFromCaches();
    const catalogSections = readSections().map((s) => ({
      id: s.id,
      name: s.name,
      parent: s.parent,
      external_id: s.external_id,
      selected_filters: s.metadata?.selected_filters || [],
    }));

    return NextResponse.json({
      ok: true,
      fetchedAt: book.fetchedAt,
      sourceName: book.sourceName,
      productCount: book.products.length,
      analysis,
      catalogSections,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось разобрать прайс KIWI",
      },
      { status: 500 },
    );
  }
}
