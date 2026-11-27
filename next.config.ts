import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["xlsx", "codepage", "iconv-lite", "sharp"],
  experimental: {
    webpackBuildWorker: false,
    workerThreads: true,
    cpus: 1,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Permanent redirects for renamed catalog section slugs (preserve SEO equity).
  async redirects() {
    return [
      {
        source: "/catalog/stroitelstvo-obshchegorodskikh-i-zagorodnykh-obektov",
        destination: "/catalog/montazh-strukturirovannykh-kabelnykh-sistem",
        permanent: true,
      },
    ];
  },
  images: {
    // Allow external images from supplier host.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ssd.ru",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.ssd.ru",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "c-tt.shop",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "www.kiwitech.ru",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "kiwitech.ru",
        pathname: "/**",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;

