import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { SectionRaw } from "@/lib/types";
import { invalidateSectionCaches } from "@/lib/data";

const DATA_PATH = path.join(process.cwd(), "data", "sections.json");

function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as SectionRaw[];
}

function writeSections(sections: SectionRaw[]): void {
  writeFileSync(DATA_PATH, JSON.stringify(sections, null, 2), "utf-8");
}

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: RouteContext) {
  try {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }

    const body: Partial<{
      name: string;
      external_id: string;
      parent: number | null;
      sort: number;
      picture: string;
      selected_filters: string[];
    }> = await request.json();

    const sections = readSections();
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: "Раздел не найден" }, { status: 404 });
    }

    const current = sections[idx];

    if (body.external_id && body.external_id !== current.external_id) {
      const dup = sections.find(
        (s) => s.id !== id && s.external_id === body.external_id,
      );
      if (dup) {
        return NextResponse.json(
          { error: `Slug "${body.external_id}" уже используется` },
          { status: 409 },
        );
      }
    }

    // Prevent circular parent reference
    if (body.parent != null && body.parent !== current.parent) {
      const isDescendant = (checkId: number, ancestorId: number): boolean => {
        if (checkId === ancestorId) return true;
        const children = sections.filter((s) => s.parent === checkId);
        return children.some((c) => isDescendant(c.id, ancestorId));
      };
      if (body.parent === id || isDescendant(id, body.parent)) {
        return NextResponse.json(
          { error: "Нельзя установить потомка в качестве родителя" },
          { status: 400 },
        );
      }
    }

    const name = body.name?.trim() ?? current.name;
    const external_id = body.external_id?.trim() ?? current.external_id;
    const parent = body.parent !== undefined ? body.parent : current.parent;
    const sort = body.sort ?? current.metadata.sort;
    const picture = body.picture !== undefined ? body.picture : current.metadata.picture;
    const selected_filters = Array.isArray(body.selected_filters)
      ? body.selected_filters.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        )
      : (current.metadata.selected_filters ?? []);

    let level = current.metadata.level;
    if (parent !== current.parent) {
      level = parent != null ? (sections.find((s) => s.id === parent)?.metadata.level ?? 1) + 1 : 1;
    }

    const updated: SectionRaw = {
      ...current,
      name,
      parent,
      external_id,
      metadata: {
        ...current.metadata,
        name,
        sort,
        code: external_id,
        parent_id: parent,
        picture,
        level,
        selected_filters,
      },
    };

    sections[idx] = updated;
    writeSections(sections);
    invalidateSectionCaches();
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Не удалось обновить раздел" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: RouteContext) {
  try {
    const { id: idStr } = await ctx.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: "Неверный id" }, { status: 400 });
    }

    const sections = readSections();

    const section = sections.find((s) => s.id === id);
    if (!section) {
      return NextResponse.json({ error: "Раздел не найден" }, { status: 404 });
    }

    const hasChildren = sections.some((s) => s.parent === id);
    if (hasChildren) {
      return NextResponse.json(
        { error: "Нельзя удалить раздел с дочерними элементами" },
        { status: 400 },
      );
    }

    writeSections(sections.filter((s) => s.id !== id));
    invalidateSectionCaches();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Не удалось удалить раздел" }, { status: 500 });
  }
}
