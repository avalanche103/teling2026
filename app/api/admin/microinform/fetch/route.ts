import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { fetchAndCachePrice } from "@/lib/microinform/price-cache";
import { buildDefaultSectionMap } from "@/lib/microinform/section-hints";
import { readSectionMap, readSettings, writeSectionMap } from "@/lib/microinform/store";
import { analyzePriceBook } from "@/lib/microinform/sync";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

export async function POST() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const settings = readSettings();
    const book = await fetchAndCachePrice(settings.priceUrl);

    const enabled = new Set(settings.enabledVendors.map((v) => v.toLowerCase()));
    const vendorSections = book.sections.filter((s) => enabled.has(s.vendor.toLowerCase()));
    const defaults = buildDefaultSectionMap(vendorSections);
    const saved = readSectionMap();
    // Keep overrides only for keys that still exist in the freshly parsed book.
    // Drops stale mojibake keys from older broken parses.
    const validTitles = new Set(vendorSections.map((s) => s.title));
    const merged = { ...defaults };
    for (const [title, action] of Object.entries(saved)) {
      if (validTitles.has(title)) merged[title] = action;
    }
    writeSectionMap(merged);

    const analysis = analyzePriceBook(book, merged);
    return NextResponse.json({
      ok: true,
      fetchedAt: book.fetchedAt,
      priceDate: book.priceDate,
      productCount: book.products.length,
      vendorCount: book.vendors.length,
      analysis,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Не удалось загрузить прайс",
      },
      { status: 500 },
    );
  }
}
