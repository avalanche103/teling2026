import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { resolveWatchlistItem } from "@/lib/price-analysis/lookup";
import {
  readWatchlist,
  writeWatchlist,
  writeWatchlistItems,
} from "@/lib/price-analysis/store";
import type { PriceAnalysisWatchlistItem } from "@/lib/price-analysis/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const watchlist = readWatchlist();
  return NextResponse.json({
    productIds: watchlist.productIds,
    updatedAt: watchlist.updatedAt,
    items: watchlist.items,
  });
}

/**
 * PUT body:
 * - { productIds: number[] } — keep only these ids (remove others), no catalog read
 * - { add: { id, sku?, name?, price?, brand?, sectionName? } } — resolve cost and append
 */
export async function PUT(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  let body: {
    productIds?: unknown;
    add?: unknown;
    patch?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный JSON" }, { status: 400 });
  }

  if (body.patch && typeof body.patch === "object") {
    const patch = body.patch as Record<string, unknown>;
    const id = typeof patch.id === "number" ? patch.id : Number(patch.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }
    const current = readWatchlist();
    const items = current.items.map((item) => {
      if (item.id !== id) return item;
      const price =
        typeof patch.price === "number" && Number.isFinite(patch.price)
          ? patch.price
          : item.price;
      const priceWithoutVat =
        typeof patch.priceWithoutVat === "number" && Number.isFinite(patch.priceWithoutVat)
          ? patch.priceWithoutVat
          : item.priceWithoutVat;
      return { ...item, price, priceWithoutVat };
    });
    const saved = writeWatchlistItems(items);
    return NextResponse.json(saved);
  }

  if (body.add && typeof body.add === "object") {
    const add = body.add as Record<string, unknown>;
    const id = typeof add.id === "number" ? add.id : Number(add.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: "Неверный id товара" }, { status: 400 });
    }

    const current = readWatchlist();
    if (current.items.some((i) => i.id === id) || current.productIds.includes(id)) {
      return NextResponse.json({
        ...current,
        already: true,
        items: current.items,
      });
    }
    if (current.items.length >= 500) {
      return NextResponse.json({ error: "Максимум 500 товаров в списке" }, { status: 400 });
    }

    const resolved = resolveWatchlistItem(id, {
      sku: typeof add.sku === "string" ? add.sku : undefined,
      name: typeof add.name === "string" ? add.name : undefined,
      price: typeof add.price === "number" ? add.price : Number(add.price),
      brand: typeof add.brand === "string" ? add.brand : undefined,
      sectionName: typeof add.sectionName === "string" ? add.sectionName : undefined,
    });

    if (!resolved) {
      return NextResponse.json(
        { error: "Товар не найден (для Микроинформа нужен id из каталога)" },
        { status: 404 },
      );
    }

    const saved = writeWatchlistItems([...current.items, resolved]);
    return NextResponse.json({ ...saved, added: resolved });
  }

  if (!Array.isArray(body.productIds)) {
    return NextResponse.json(
      { error: "Ожидается productIds: number[] или add: { id, … }" },
      { status: 400 },
    );
  }

  const ids = body.productIds
    .map((id) => (typeof id === "number" ? id : Number(id)))
    .filter((id) => Number.isFinite(id) && id > 0)
    .map((id) => Math.trunc(id));

  if (ids.length > 500) {
    return NextResponse.json({ error: "Максимум 500 товаров в списке" }, { status: 400 });
  }

  const saved = writeWatchlist(ids);
  return NextResponse.json(saved);
}

export type { PriceAnalysisWatchlistItem };
