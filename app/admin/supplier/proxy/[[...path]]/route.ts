import { type NextRequest, NextResponse } from "next/server";

const SSD_BASE = "/ssd";

export const dynamic = "force-dynamic";

function buildRedirectUrl(request: NextRequest, pathParts: string[]): URL {
  const url = new URL(request.url);
  url.pathname = pathParts.length ? `${SSD_BASE}/${pathParts.join("/")}` : SSD_BASE;
  url.search = request.nextUrl.search;
  return url;
}

async function redirectToSsd(request: NextRequest, pathParts: string[]) {
  return NextResponse.redirect(buildRedirectUrl(request, pathParts), 307);
}

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return redirectToSsd(request, path);
}
