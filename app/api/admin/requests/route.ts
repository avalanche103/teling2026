import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getRequests } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// GET /api/admin/requests — list all product requests (newest / unseen first)
export async function GET() {
  const auth = await requireApiSession(["admin", "employee", "operator"]);
  if (!auth.ok) return auth.response;

  const sorted = [...getRequests()].sort((a, b) => {
    const aUnseen = !a.seenAt ? 1 : 0;
    const bUnseen = !b.seenAt ? 1 : 0;
    if (aUnseen !== bUnseen) return bUnseen - aUnseen;
    const aDraft = a.status === "draft" ? 1 : 0;
    const bDraft = b.status === "draft" ? 1 : 0;
    if (aDraft !== bDraft) return bDraft - aDraft;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return NextResponse.json(sorted);
}
