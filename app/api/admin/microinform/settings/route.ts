import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { readSettings, writeSettings, type MicroinformSettings } from "@/lib/microinform/store";

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
    const body = (await request.json()) as Partial<MicroinformSettings>;
    const current = readSettings();
    const next: MicroinformSettings = {
      priceUrl:
        typeof body.priceUrl === "string" && body.priceUrl.trim()
          ? body.priceUrl.trim()
          : current.priceUrl,
      markupPercent:
        typeof body.markupPercent === "number" && Number.isFinite(body.markupPercent)
          ? Math.max(0, body.markupPercent)
          : current.markupPercent,
      enabledVendors: Array.isArray(body.enabledVendors)
        ? body.enabledVendors.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : current.enabledVendors,
    };
    writeSettings(next);
    return NextResponse.json(next);
  } catch {
    return NextResponse.json({ error: "Не удалось сохранить настройки" }, { status: 500 });
  }
}
