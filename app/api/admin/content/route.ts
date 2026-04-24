import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getAllContent } from "@/lib/content";

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !["admin", "employee"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const content = await getAllContent();
    return NextResponse.json(content);
  } catch (error) {
    console.error("Error fetching content:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}
