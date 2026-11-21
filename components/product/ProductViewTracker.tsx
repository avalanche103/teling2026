"use client";

import { useEffect } from "react";

const SESSION_PREFIX = "product-viewed:";

interface ProductViewTrackerProps {
  sku: string;
}

export function ProductViewTracker({ sku }: ProductViewTrackerProps) {
  useEffect(() => {
    const normalized = sku.trim();
    if (!normalized) return;

    try {
      const key = `${SESSION_PREFIX}${normalized}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage may be blocked; still count once per mount.
    }

    void fetch("/api/products/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku: normalized }),
      keepalive: true,
      cache: "no-store",
    }).catch(() => {
      // Tracking must never affect the product page.
    });
  }, [sku]);

  return null;
}
