import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { invalidateProductCaches } from "@/lib/data";
import { enrichConceptProducts } from "@/lib/concept/enrich";

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
      productIds?: number[];
    };
    const result = await enrichConceptProducts({
      onlyMissing: body.onlyMissing !== false,
      limit: typeof body.limit === "number" ? body.limit : 30,
      productIds: Array.isArray(body.productIds) ? body.productIds : undefined,
    });
    invalidateProductCaches();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Ошибка обогащения",
      },
      { status: 500 },
    );
  }
}
