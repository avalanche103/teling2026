import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getContentBlock, updateContentBlock } from "@/lib/content";

type RouteParams = Promise<{ key: string }>;

export async function GET(
  _request: NextRequest,
  props: { params: RouteParams }
) {
  const { key } = await props.params;
  try {
    const session = await getSession();
    if (!session || !["admin", "employee"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!["hero", "about", "contacts"].includes(key)) {
      return NextResponse.json(
        { error: "Invalid content key" },
        { status: 400 }
      );
    }

    const content = await getContentBlock(
      key as "hero" | "about" | "contacts"
    );
    if (!content) {
      return NextResponse.json({ error: "Content not found" }, { status: 404 });
    }

    return NextResponse.json(content);
  } catch (error) {
    console.error("Error fetching content block:", error);
    return NextResponse.json(
      { error: "Failed to fetch content block" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  props: { params: RouteParams }
) {
  const { key } = await props.params;
  try {
    const session = await getSession();
    if (!session || !["admin", "employee"].includes(session.user.role)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!["hero", "about", "contacts"].includes(key)) {
      return NextResponse.json(
        { error: "Invalid content key" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { title, content } = body;

    if (typeof title !== "string" || typeof content !== "string") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    const updated = await updateContentBlock(key as "hero" | "about" | "contacts", {
      title,
      content,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating content block:", error);
    return NextResponse.json(
      { error: "Failed to update content block" },
      { status: 500 }
    );
  }
}
