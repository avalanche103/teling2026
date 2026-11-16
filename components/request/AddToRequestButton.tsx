"use client";

import { useState } from "react";
import { useRequestCart } from "@/components/request/RequestCartProvider";

interface AddToRequestButtonProps {
  sku: string;
  qty?: number;
  className?: string;
  label?: string;
  compact?: boolean;
}

export function AddToRequestButton({
  sku,
  qty = 1,
  className,
  label = "В запрос",
  compact = false,
}: AddToRequestButtonProps) {
  const { addItem } = useRequestCart();
  const [flash, setFlash] = useState(false);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    addItem(sku, qty);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={
        className ??
        (compact
          ? "rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
          : "w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800")
      }
    >
      {flash ? "Добавлено" : label}
    </button>
  );
}
