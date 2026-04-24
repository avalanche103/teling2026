import { NextRequest, NextResponse } from "next/server";
import { getImportHistory } from "@/lib/import-history";
import { requireApiSession } from "@/lib/auth";

/**
 * GET /api/admin/products/import/history
 * Returns the import history
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;
  try {
    const history = await getImportHistory();
    return NextResponse.json(history);
  } catch (error) {
    console.error("Failed to load import history:", error);
    return NextResponse.json(
      { error: "Failed to load import history" },
      { status: 500 }
    );
  }
}
