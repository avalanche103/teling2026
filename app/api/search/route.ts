import { searchProducts } from "@/lib/data";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") ?? "24", 10),
    100
  );

  const results = searchProducts(q, limit);
  return Response.json({ results, query: q });
}
