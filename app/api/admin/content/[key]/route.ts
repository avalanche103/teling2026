import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getContentBlock, updateContentBlock } from "@/lib/content";
import type { ContactsContent } from "@/lib/types";

type RouteParams = Promise<{ key: string }>;

function isValidContactsPayload(value: unknown): value is ContactsContent {
  if (!value || typeof value !== "object") return false;

  const contacts = value as ContactsContent;
  if (typeof contacts.address !== "string") return false;
  if (typeof contacts.email !== "string") return false;
  if (!Array.isArray(contacts.phones)) return false;

  return contacts.phones.every((phone) => {
    if (!phone || typeof phone !== "object") return false;
    return typeof phone.value === "string" && typeof phone.href === "string" && (typeof phone.badge === "undefined" || typeof phone.badge === "string") && (typeof phone.badgeColor === "undefined" || typeof phone.badgeColor === "string");
  });
}

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
    const { title, content, contacts } = body;

    if (typeof title !== "string" || typeof content !== "string") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 }
      );
    }

    if (key === "contacts" && typeof contacts !== "undefined" && !isValidContactsPayload(contacts)) {
      return NextResponse.json(
        { error: "Invalid contacts payload" },
        { status: 400 }
      );
    }

    const updates = {
      title,
      content,
      ...(key === "contacts" ? { contacts } : {}),
    };

    const updated = await updateContentBlock(key as "hero" | "about" | "contacts", updates);

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating content block:", error);
    return NextResponse.json(
      { error: "Failed to update content block" },
      { status: 500 }
    );
  }
}
