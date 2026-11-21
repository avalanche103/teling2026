import { type NextRequest } from "next/server";
import { incrementProductView } from "@/lib/product-views";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  const sku =
    body && typeof body === "object" && "sku" in body && typeof (body as { sku: unknown }).sku === "string"
      ? (body as { sku: string }).sku.trim()
      : "";

  if (!sku || sku.length > 128) {
    return new Response(null, { status: 400 });
  }

  incrementProductView(sku);
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
