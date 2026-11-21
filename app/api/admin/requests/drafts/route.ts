import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { deleteDraftRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// DELETE /api/admin/requests/drafts — remove all unsubmitted drafts
export async function DELETE() {
  const auth = await requireApiSession(["admin", "employee"]);
  if (!auth.ok) return auth.response;

  const deleted = deleteDraftRequests();
  return NextResponse.json({ ok: true, deleted });
}
