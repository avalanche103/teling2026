import { NextRequest, NextResponse } from "next/server";
import { sendProductRequestEmail } from "@/lib/email";
import { resolveRequestItems, type IncomingCartItem } from "@/lib/request-items";
import {
  getRequestById,
  submitProductRequest,
  upsertDraftRequest,
} from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

const rateMap = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now >= entry.resetAt) {
    rateMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX) return false;
  entry.count += 1;
  return true;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: "Слишком много запросов. Попробуйте позже." },
      { status: 429 }
    );
  }

  let body: {
    id?: unknown;
    organization?: unknown;
    phone?: unknown;
    email?: unknown;
    items?: IncomingCartItem[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const organization = String(body.organization ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();

  if (!organization || organization.length > 200) {
    return NextResponse.json(
      { error: "Укажите название организации" },
      { status: 400 }
    );
  }
  if (!phone || !isValidPhone(phone)) {
    return NextResponse.json({ error: "Укажите корректный телефон" }, { status: 400 });
  }
  if (!email || !isValidEmail(email) || email.length > 200) {
    return NextResponse.json({ error: "Укажите корректный email" }, { status: 400 });
  }

  let draftId =
    typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;

  const incomingItems = Array.isArray(body.items) ? body.items : null;
  const resolvedItems = incomingItems ? resolveRequestItems(incomingItems) : null;

  if (draftId) {
    const existing = getRequestById(draftId);
    if (!existing || existing.status === "submitted") {
      draftId = null;
    }
  }

  if (!draftId) {
    if (!resolvedItems || resolvedItems.length === 0) {
      return NextResponse.json(
        { error: "Добавьте хотя бы один товар" },
        { status: 400 }
      );
    }
    const created = upsertDraftRequest(null, resolvedItems);
    draftId = created.id;
  }

  const itemsForSubmit =
    resolvedItems && resolvedItems.length > 0 ? resolvedItems : undefined;

  if (!itemsForSubmit) {
    const existing = getRequestById(draftId);
    if (!existing || existing.items.length === 0) {
      return NextResponse.json(
        { error: "Добавьте хотя бы один товар" },
        { status: 400 }
      );
    }
  }

  const submitted = submitProductRequest(
    draftId,
    { organization, phone, email },
    itemsForSubmit
  );

  if (!submitted) {
    return NextResponse.json({ error: "Запрос не найден" }, { status: 404 });
  }

  try {
    await sendProductRequestEmail(submitted);
  } catch (err) {
    console.warn("[email] Не удалось отправить запрос:", err);
  }

  return NextResponse.json({
    ok: true,
    id: submitted.id,
    number: submitted.number,
    status: submitted.status,
  });
}
