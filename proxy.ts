import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const APEX_HOST = "teling.by";

function requestHost(request: NextRequest): string {
  const raw = request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
  return raw.split(",")[0]?.trim().split(":")[0]?.toLowerCase() || "";
}

export function proxy(request: NextRequest) {
  const host = requestHost(request);
  const { pathname, search } = request.nextUrl;

  if (host === `www.${APEX_HOST}`) {
    return NextResponse.redirect(`https://${APEX_HOST}${pathname}${search}`, 301);
  }

  if (pathname === "/upload" || pathname.startsWith("/upload/")) {
    return new NextResponse("Gone", {
      status: 410,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Robots-Tag": "noindex, nofollow",
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|ico|svg|txt|xml)$).*)",
  ],
};

