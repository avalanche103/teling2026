import { NextRequest, NextResponse } from "next/server";
import { resolveRequestItems, type IncomingCartItem } from "@/lib/request-items";
import { upsertDraftRequest } from "@/lib/requests";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;

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
    items?: IncomingCartItem[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: "Укажите позиции запроса" }, { status: 400 });
  }

  const items = resolveRequestItems(body.items);
  if (items.length === 0 && body.items.length > 0) {
    return NextResponse.json(
      { error: "Ни один из указанных товаров не найден" },
      { status: 400 }
    );
  }

  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;
  const draft = upsertDraftRequest(id, items);

  return NextResponse.json({
    ok: true,
    id: draft.id,
    number: draft.number,
    status: draft.status,
    items: draft.items,
  });
}
