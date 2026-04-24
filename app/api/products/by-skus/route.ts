import { type NextRequest } from "next/server";
import { getProductSummaryBySku } from "@/lib/data";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const requested = request.nextUrl.searchParams.getAll("sku");
  const uniqueSkus = Array.from(
    new Set(
      requested
        .map((sku) => sku.trim())
        .filter((sku) => sku.length > 0)
    )
  ).slice(0, 16);

  const items = uniqueSkus
    .map((sku) => getProductSummaryBySku(sku))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return Response.json(
    { items },
    { headers: { "Cache-Control": "no-store, max-age=0" } }
  );
}
