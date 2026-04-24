import { NextResponse } from "next/server";
import path from "path";
import { readFileSync, writeFileSync } from "fs";
import type { SectionRaw } from "@/lib/types";
import { invalidateSectionCaches } from "@/lib/data";
import { requireApiSession } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATA_PATH = path.join(process.cwd(), "data", "sections.json");

function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(DATA_PATH, "utf-8")) as SectionRaw[];
}

function writeSections(sections: SectionRaw[]): void {
  writeFileSync(DATA_PATH, JSON.stringify(sections, null, 2), "utf-8");
}

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const sections = readSections();
    return NextResponse.json(sections, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать разделы" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const body: {
      name: string;
      external_id: string;
      parent: number | null;
      sort?: number;
      picture?: string;
      selected_filters?: string[];
    } = await request.json();

    if (!body.name?.trim() || !body.external_id?.trim()) {
      return NextResponse.json(
        { error: "Поля name и external_id обязательны" },
        { status: 400 },
      );
    }

    const sections = readSections();

    const duplicate = sections.find((s) => s.external_id === body.external_id.trim());
    if (duplicate) {
      return NextResponse.json(
        { error: `Slug "${body.external_id}" уже используется` },
        { status: 409 },
      );
    }

    const maxId = sections.reduce((m, s) => Math.max(m, s.id), 0);
    const newId = maxId + 1;

    let level = 1;
    if (body.parent != null) {
      const parentSection = sections.find((s) => s.id === body.parent);
      level = (parentSection?.metadata?.level ?? 1) + 1;
    }

    const created: SectionRaw = {
      id: newId,
      name: body.name.trim(),
      parent: body.parent ?? null,
      external_id: body.external_id.trim(),
      metadata: {
        id: newId,
        name: body.name.trim(),
        sort: body.sort ?? 500,
        code: body.external_id.trim(),
        url: "",
        level,
        parent_id: body.parent ?? null,
        picture: body.picture ?? "",
        selected_filters: Array.isArray(body.selected_filters)
          ? body.selected_filters.filter(
              (v): v is string => typeof v === "string" && v.trim().length > 0
            )
          : [],
      },
    };

    sections.push(created);
    writeSections(sections);
    invalidateSectionCaches();
    return NextResponse.json(created, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Не удалось создать раздел" }, { status: 500 });
  }
}
