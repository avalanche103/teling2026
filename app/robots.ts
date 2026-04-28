import type { MetadataRoute } from "next";

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/login", "/api", "/admin/supplier/proxy", "/ssd"],
      },
    ],
    sitemap: `${getSiteOrigin()}/sitemap.xml`,
    host: getSiteOrigin(),
  };
}
