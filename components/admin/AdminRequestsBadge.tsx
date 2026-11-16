"use client";

import { useEffect, useRef, useState } from "react";
import type { ProductRequest } from "@/lib/requests";

function countUnseen(requests: ProductRequest[]): number {
  return requests.filter((r) => !r.seenAt).length;
}

export function AdminRequestsBadge() {
  const [unseen, setUnseen] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function fetchAndCount() {
    try {
      const res = await fetch("/api/admin/requests", { cache: "no-store" });
      if (res.ok) {
        const requests: ProductRequest[] = await res.json();
        setUnseen(countUnseen(requests));
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchAndCount();
    pollRef.current = setInterval(fetchAndCount, 8000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  if (unseen === 0) return null;

  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
      {unseen}
    </span>
  );
}
