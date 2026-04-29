import { type NextRequest, NextResponse } from "next/server";
import { canAccessRole, getDefaultAdminPath, getSession } from "@/lib/auth";

const DEFAULT_TARGET = "http://127.0.0.1:5000";
const PROXY_BASE = "/ssd";
const ALLOWED_ROLES = ["admin", "employee"] as const;

export const dynamic = "force-dynamic";

function getPublicOrigin(request: NextRequest): string {
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();
  const forwardedHost = request.headers
    .get("x-forwarded-host")
    ?.split(",")[0]
    ?.trim();
  const host = request.headers.get("host")?.split(",")[0]?.trim();

  const proto = forwardedProto || request.nextUrl.protocol.replace(":", "") || "https";
  const resolvedHost = forwardedHost || host || request.nextUrl.host;
  return `${proto}://${resolvedHost}`;
}

function buildPublicUrl(request: NextRequest, pathname: string): URL {
  return new URL(pathname, getPublicOrigin(request));
}

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

async function ensureAccess(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.redirect(buildPublicUrl(request, "/login"), 303);
  }

  if (!canAccessRole(session.user.role, [...ALLOWED_ROLES])) {
    return NextResponse.redirect(buildPublicUrl(request, getDefaultAdminPath(session.user.role)), 303);
  }

  return null;
}

async function proxy(request: NextRequest, pathParts: string[]) {
  const accessResponse = await ensureAccess(request);
  if (accessResponse) {
    return accessResponse;
  }

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