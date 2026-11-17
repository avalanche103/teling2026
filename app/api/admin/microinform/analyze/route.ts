import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readCachedPriceBook } from "@/lib/microinform/price-cache";
import { analyzePriceBook } from "@/lib/microinform/sync";
import type { SectionMap } from "@/lib/microinform/store";
import { readSections } from "@/lib/microinform/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const book = readCachedPriceBook();
  if (!book) {
    return NextResponse.json(
      { error: "Прайс ещё не загружен. Нажмите «Обновить прайс»." },
      { status: 404 },
    );
  }

  const analysis = analyzePriceBook(book);
  const catalogSections = readSections().map((s) => ({
    id: s.id,
    name: s.name,
    parent: s.parent,
    external_id: s.external_id,
    selected_filters: s.metadata?.selected_filters || [],
  }));

  return NextResponse.json({
    fetchedAt: book.fetchedAt,
    priceDate: book.priceDate,
    productCount: book.products.length,
    analysis,
    catalogSections,
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const book = readCachedPriceBook();
  if (!book) {
    return NextResponse.json(
      { error: "Прайс ещё не загружен. Нажмите «Обновить прайс»." },
      { status: 404 },
    );
  }

  try {
    const body = (await request.json()) as { sectionMap?: SectionMap };
    const analysis = analyzePriceBook(book, body.sectionMap);
    return NextResponse.json({
      fetchedAt: book.fetchedAt,
      priceDate: book.priceDate,
      productCount: book.products.length,
      analysis,
    });
  } catch {
    return NextResponse.json({ error: "Не удалось проанализировать прайс" }, { status: 500 });
  }
}
