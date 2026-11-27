import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readSettings, writeSettings, type ConceptSettings } from "@/lib/concept/store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json(readSettings(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as Partial<ConceptSettings>;
    const current = readSettings();
    const next: ConceptSettings = {
      usdToBynRate:
        typeof body.usdToBynRate === "number" && Number.isFinite(body.usdToBynRate) && body.usdToBynRate > 0
          ? body.usdToBynRate
          : current.usdToBynRate,
      markupPercent:
        typeof body.markupPercent === "number" && Number.isFinite(body.markupPercent)
          ? Math.max(0, body.markupPercent)
          : current.markupPercent,
      enabledBrands: Array.isArray(body.enabledBrands)
        ? body.enabledBrands.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : current.enabledBrands,
    };
    writeSettings(next);
    return NextResponse.json(next);
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить настройки" }, { status: 500 });
  }
}
