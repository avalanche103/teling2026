import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getLatestSyncLog } from "@/lib/microinform/daily-sync";
import { listPendingMicroinformProducts } from "@/lib/microinform/pending";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const products = listPendingMicroinformProducts();
  return NextResponse.json({
    products,
    count: products.length,
    lastSync: getLatestSyncLog(),
  });
}
