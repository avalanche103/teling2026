import type { MetadataRoute } from "next";
import {
  getAllProductSkus,
  getAllSectionSlugs,
  getLatestProductsUpdatedAt,
  getProductLastModifiedBySku,
  getSectionLastModifiedBySlug,
} from "@/lib/data";

function getSiteOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw).origin;
  } catch {
    return "https://teling.by";
  }
}

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  const fallbackDate = getLatestProductsUpdatedAt() ?? new Date();
  const productLastModifiedMap = getProductLastModifiedBySku();
  const sectionLastModifiedMap = getSectionLastModifiedBySlug();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: fallbackDate, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/catalog`, lastModified: fallbackDate, changeFrequency: "daily", priority: 0.9 },
  ];

  const categoryRoutes: MetadataRoute.Sitemap = getAllSectionSlugs().map((slug) => ({
    url: `${origin}/catalog/${encodeURIComponent(slug)}`,
    lastModified: sectionLastModifiedMap.get(slug) ?? fallbackDate,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const productRoutes: MetadataRoute.Sitemap = getAllProductSkus().map((sku) => ({
    url: `${origin}/product/${encodeURIComponent(sku)}`,
    lastModified: productLastModifiedMap.get(sku) ?? fallbackDate,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
