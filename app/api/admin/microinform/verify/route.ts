import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { verifyManufacturerProducts } from "@/lib/microinform/verify";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      vendors?: string[];
      limit?: number;
      rebuildIndex?: boolean;
      updateMedia?: boolean;
      onlyMismatched?: boolean;
    };

    const vendors = Array.isArray(body.vendors) && body.vendors.length
      ? body.vendors
      : ["D-Link", "Origo", "ATEN"];

    const result = await verifyManufacturerProducts({
      vendors,
      limit: typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 200) : 80,
      delayMs: 200,
      rebuildIndex: body.rebuildIndex !== false,
      updateMedia: body.updateMedia !== false,
      onlyMismatched: body.onlyMismatched === true,
    });

    return NextResponse.json({
      ok: true,
      ...result,
      message:
        `Проверка: ${result.processed} поз., URL обновлено ${result.urlUpdated}, ` +
        `названий ${result.nameUpdated}, обогащено ${result.enriched}, ` +
        `без страницы ${result.unresolved}, ошибок ${result.failed}` +
        ` (индекс ${result.indexSize})`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Проверка производителя не удалась",
      },
      { status: 500 },
    );
  }
}
