import { type NextRequest } from "next/server";

const DEFAULT_TARGET = "http://127.0.0.1:5000";
const PROXY_BASE = "/admin/supplier/proxy";

export const dynamic = "force-dynamic";

function getTargetBase(): URL {
  const raw = process.env.SSD_ADMIN_APP_URL?.trim() || DEFAULT_TARGET;
  return new URL(raw.endsWith("/") ? raw.slice(0, -1) : raw);
}

function buildTargetUrl(request: NextRequest, pathParts: string[]): URL {
  const target = getTargetBase();
  const path = pathParts.join("/");
  target.pathname = path ? `/${path}` : "/";
  target.search = request.nextUrl.search;
  return target;
}

function copyRequestHeaders(request: NextRequest): Headers {
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  return headers;
}

function rewriteLocationHeader(location: string): string {
  if (!location) return location;

  try {
    const target = getTargetBase();
    const candidate = new URL(location, target);
    if (candidate.origin === target.origin) {
      return `${PROXY_BASE}${candidate.pathname}${candidate.search}${candidate.hash}`;
    }
  } catch {
    // Keep original location if it's not parseable.
  }

  if (location.startsWith("/")) {
    return `${PROXY_BASE}${location}`;
  }

  return location;
}

function rewriteHtmlBody(html: string): string {
  // Flask templates use root-absolute URLs (e.g. /sections, /status),
  // so we remap them to the Next.js proxy base.
  return html
    .replaceAll('href="/', `href="${PROXY_BASE}/`)
    .replaceAll("href='/", `href='${PROXY_BASE}/`)
    .replaceAll('src="/', `src="${PROXY_BASE}/`)
    .replaceAll("src='/", `src='${PROXY_BASE}/`)
    .replaceAll('action="/', `action="${PROXY_BASE}/`)
    .replaceAll("action='/", `action='${PROXY_BASE}/`)
    .replaceAll('fetch("/', `fetch("${PROXY_BASE}/`)
    .replaceAll("fetch('/", `fetch('${PROXY_BASE}/`);
}

async function proxy(request: NextRequest, pathParts: string[]) {
  const method = request.method.toUpperCase();
  const body = method === "GET" || method === "HEAD" ? undefined : await request.arrayBuffer();

  const response = await fetch(buildTargetUrl(request, pathParts), {
    method,
    headers: copyRequestHeaders(request),
    body,
    redirect: "manual",
    cache: "no-store",
  });

  const headers = new Headers(response.headers);
  const contentType = headers.get("content-type") ?? "";
  const location = headers.get("location");

  if (location) {
    headers.set("location", rewriteLocationHeader(location));
  }

  headers.delete("content-length");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");

  if (contentType.includes("text/html")) {
    const html = await response.text();
    const rewritten = rewriteHtmlBody(html);
    return new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

type RouteContext = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return proxy(request, path);
}
