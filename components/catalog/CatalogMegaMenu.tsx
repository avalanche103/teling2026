"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { CatalogNavNode } from "@/lib/types";

interface CatalogMegaMenuProps {
  roots: CatalogNavNode[];
}

export function CatalogMegaMenu({ roots }: CatalogMegaMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex items-center gap-1 transition-colors hover:text-black/70"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen((v) => !v)}
      >
        Каталог
        <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-1/2 top-full z-50 mt-3 w-[min(92vw,52rem)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-black">Разделы каталога</p>
            <Link
              href="/catalog"
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-black/60 hover:text-black"
            >
              Все разделы →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {roots.map((root) => (
              <div key={root.id} className="min-w-0">
                <Link
                  href={`/catalog/${root.slug}`}
                  onClick={() => setOpen(false)}
                  className="block text-sm font-semibold text-black hover:underline"
                >
                  {root.name}
                  <span className="ml-1 font-normal text-black/40">
                    ({root.productCount})
                  </span>
                </Link>
                {root.children.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {root.children.slice(0, 6).map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/catalog/${child.slug}`}
                          onClick={() => setOpen(false)}
                          className="block truncate text-sm text-black/70 hover:text-black"
                        >
                          {child.name}
                        </Link>
                      </li>
                    ))}
                    {root.children.length > 6 && (
                      <li>
                        <Link
                          href={`/catalog/${root.slug}`}
                          onClick={() => setOpen(false)}
                          className="text-xs font-medium text-black/50 hover:text-black"
                        >
                          Ещё {root.children.length - 6}…
                        </Link>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
