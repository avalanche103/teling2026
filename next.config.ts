import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {},
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
    ],
    unoptimized: true,
  },
};

export default nextConfig;

