import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { listPendingConceptProducts } from "@/lib/concept/pending";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    products: listPendingConceptProducts(),
  });
}
