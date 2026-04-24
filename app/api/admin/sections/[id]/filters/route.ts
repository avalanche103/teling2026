import { NextResponse } from "next/server";
import { getSectionFacets, getSectionSelectedFilters } from "@/lib/data";
import type { SectionFilterOption } from "@/lib/types";
import { requireApiSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: RouteContext) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }

    const facets = getSectionFacets(id);
    const options: SectionFilterOption[] = [];

    if (facets.brands.length > 1) {
      options.push({
        key: "brand",
        label: "Производитель",
        count: facets.brands.length,
      });
    }

    if (facets.priceMax > facets.priceMin && facets.priceMax > 0) {
      options.push({ key: "price", label: "Цена" });
    }

    for (const facet of facets.chars) {
      options.push({
        key: `char:${facet.name}`,
        label: facet.name,
        count: facet.values.length,
      });
    }

    const selected = getSectionSelectedFilters(id);
    return NextResponse.json(
      {
        options,
        // If section was never configured, all currently available filters are active by default.
        selected: selected ?? options.map((o) => o.key),
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Не удалось получить фильтры раздела" },
      { status: 500 }
    );
  }
}
