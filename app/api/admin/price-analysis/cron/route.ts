import { NextResponse } from "next/server";
import { getSchedulerPublicStatus, runSchedulerTick } from "@/lib/price-analysis/scheduler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

function authorize(request: Request): boolean {
  const secret = process.env.PRICE_ANALYSIS_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const token = match?.[1]?.trim() || "";
  return Boolean(token) && token === secret;
}

/** Hourly cron tick — Bearer PRICE_ANALYSIS_CRON_SECRET */
export async function POST(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSchedulerTick(new Date());
  return NextResponse.json({
    ...result,
    scheduler: getSchedulerPublicStatus(),
  });
}

/** Status for ops / scripts */
export async function GET(request: Request) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getSchedulerPublicStatus());
}
