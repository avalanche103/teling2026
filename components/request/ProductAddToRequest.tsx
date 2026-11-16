"use client";

import { useState } from "react";
import { useRequestCart } from "@/components/request/RequestCartProvider";

interface ProductAddToRequestProps {
  sku: string;
  minQty?: number;
}

export function ProductAddToRequest({ sku, minQty = 1 }: ProductAddToRequestProps) {
  const { addItem } = useRequestCart();
  const initial = Math.max(1, Math.floor(minQty) || 1);
  const [qty, setQty] = useState(initial);
  const [flash, setFlash] = useState(false);

  function handleAdd() {
    const next = Math.max(1, Math.floor(qty) || 1);
    addItem(sku, next);
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1200);
  }

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-black/70">
        Добавить в запрос
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Уменьшить количество"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => {
              const next = Math.floor(Number(e.target.value));
              if (Number.isFinite(next) && next >= 1) setQty(next);
              else if (e.target.value === "") setQty(1);
            }}
            className="h-10 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center text-sm outline-none ring-slate-400 focus:ring-2"
          />
          <button
            type="button"
            aria-label="Увеличить количество"
            onClick={() => setQty((q) => q + 1)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
          >
            +
          </button>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="h-10 flex-1 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:flex-none"
        >
          {flash ? "Добавлено" : "Добавить в запрос"}
        </button>
      </div>
    </div>
  );
}
