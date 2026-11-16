import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches } from "@/lib/data";
import { enrichMicroinformProducts } from "@/lib/microinform/enrich";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      onlyMissing?: boolean;
      limit?: number;
    };
    const result = await enrichMicroinformProducts({
      onlyMissing: body.onlyMissing !== false,
      limit: typeof body.limit === "number" ? Math.min(Math.max(body.limit, 1), 100) : 30,
      delayMs: 200,
    });
    invalidateProductCaches();
    return NextResponse.json({
      ok: true,
      ...result,
      message: `Обработано ${result.processed}, с описанием ${result.withDescription}, фото ${result.imagesDownloaded}, ошибок ${result.failed}`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Обогащение не удалось",
      },
      { status: 500 },
    );
  }
}
