"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { CatalogNavNode } from "@/lib/types";

interface CatalogMegaMenuTriggerProps {
  open: boolean;
  onToggle: () => void;
  panelId: string;
}

export function CatalogMegaMenuTrigger({
  open,
  onToggle,
  panelId,
}: CatalogMegaMenuTriggerProps) {
  return (
    <button
      type="button"
      data-catalog-flyout-trigger="true"
      className="inline-flex items-center gap-1 transition-colors hover:text-black/70"
      aria-expanded={open}
      aria-haspopup="true"
      aria-controls={open ? panelId : undefined}
      onClick={onToggle}
    >
      Каталог
      <ChevronDown
        className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

interface CatalogMegaMenuPanelProps {
  roots: CatalogNavNode[];
  activeRootId: number | null;
  onActiveRootIdChange: (id: number) => void;
  onClose: () => void;
  panelId: string;
}

export function CatalogMegaMenuPanel({
  roots,
  activeRootId,
  onActiveRootIdChange,
  onClose,
  panelId,
}: CatalogMegaMenuPanelProps) {
  const activeRoot =
    roots.find((root) => root.id === activeRootId) ?? roots[0] ?? null;

  if (!roots.length) return null;

  return (
    <div
      id={panelId}
      data-catalog-flyout-panel="true"
      className="absolute left-0 right-0 top-full z-50 border-b border-slate-200 bg-white shadow-xl"
      role="menu"
      aria-label="Разделы каталога"
    >
      <div className="container mx-auto px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-black">Каталог</p>
          <Link
            href="/catalog"
            onClick={onClose}
            className="text-sm font-medium text-black/60 hover:text-black"
          >
            Все разделы →
          </Link>
        </div>

        <div className="flex max-h-[28rem] overflow-hidden rounded-2xl border border-slate-200">
          <aside className="w-80 shrink-0 overflow-y-auto bg-slate-50">
            <ul className="p-2">
              {roots.map((root) => {
                const active = root.id === activeRoot?.id;
                return (
                  <li key={root.id}>
                    <button
                      type="button"
                      role="menuitem"
                      className={
                        active
                          ? "flex w-full items-start gap-2 rounded-xl bg-white px-3 py-2.5 text-left shadow-sm"
                          : "flex w-full items-start gap-2 rounded-xl px-3 py-2.5 text-left hover:bg-slate-100"
                      }
                      onMouseEnter={() => onActiveRootIdChange(root.id)}
                      onFocus={() => onActiveRootIdChange(root.id)}
                      onClick={() => onActiveRootIdChange(root.id)}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold leading-snug text-black">
                          {root.name}
                        </span>
                        <span className="mt-0.5 block text-xs text-black/40">
                          {root.productCount.toLocaleString("ru-RU")} позиций
                        </span>
                      </span>
                      <ChevronRight
                        className={
                          active
                            ? "mt-1 h-4 w-4 shrink-0 text-black/70"
                            : "mt-1 h-4 w-4 shrink-0 text-black/40"
                        }
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {activeRoot ? (
              <>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-black/40">
                      Подкатегории
                    </p>
                    <p className="text-sm font-semibold leading-snug text-black">
                      {activeRoot.name}
                    </p>
                  </div>
                  <Link
                    href={`/catalog/${activeRoot.slug}`}
                    onClick={onClose}
                    className="shrink-0 text-sm font-semibold text-black hover:text-black/70"
                  >
                    Смотреть раздел →
                  </Link>
                </div>

                {activeRoot.children.length > 0 ? (
                  <ul className="grid gap-1 sm:grid-cols-2">
                    {activeRoot.children.map((child) => (
                      <li key={child.id}>
                        <Link
                          href={`/catalog/${child.slug}`}
                          onClick={onClose}
                          className="block rounded-xl px-3 py-2 text-sm leading-snug text-black/80 hover:bg-slate-50 hover:text-black"
                        >
                          <span className="font-medium">{child.name}</span>
                          <span className="mt-0.5 block text-xs text-black/40">
                            {child.productCount.toLocaleString("ru-RU")} позиций
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-600">
                    В этом разделе пока нет подкатегорий.
                  </p>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
