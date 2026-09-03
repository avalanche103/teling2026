import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function getMetPayWebhookUrl(): string {
  const configured = process.env.METPAY_BACKEND_URL?.trim();
  if (!configured) {
    return "http://127.0.0.1:8000/api/webhooks/artpay";
  }

  const normalized = configured.replace(/\/$/, "");
  if (normalized.endsWith("/api/webhooks/artpay")) {
    return normalized;
  }

  return `${normalized}/api/webhooks/artpay`;
}

function copyForwardHeaders(request: NextRequest): Headers {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") {
      return;
    }
    if (lower === "content-type" || lower.startsWith("ap-")) {
      headers.set(key, value);
    }
  });

  return headers;
}

export async function POST(request: NextRequest) {
  const body = await request.arrayBuffer();

  let response: Response;
  try {
    response = await fetch(getMetPayWebhookUrl(), {
      method: "POST",
      headers: copyForwardHeaders(request),
      body,
      cache: "no-store",
    });
  } catch {
    return new Response(
      JSON.stringify({ detail: "MetPay backend is unavailable" }),
      {
        status: 502,
        headers: {
          "content-type": "application/json",
          "x-robots-tag": "noindex, nofollow, noarchive",
        },
      },
    );
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("x-robots-tag", "noindex, nofollow, noarchive");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
