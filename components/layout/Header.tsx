"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { ChevronDown, ClipboardList, Menu, Phone, Search, X } from "lucide-react";
import { SearchAutocomplete } from "@/components/layout/SearchAutocomplete";
import {
  CatalogMegaMenuPanel,
  CatalogMegaMenuTrigger,
} from "@/components/catalog/CatalogMegaMenu";
import { useRequestCart } from "@/components/request/RequestCartProvider";
import type { CatalogNavNode } from "@/lib/types";

function CountBadge({
  count,
  variant = "inline",
}: {
  count: number;
  variant?: "inline" | "corner";
}) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);

  if (variant === "corner") {
    return (
      <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1 text-[11px] font-bold leading-none text-white">
        {label}
      </span>
    );
  }

  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-900 px-1.5 text-[11px] font-bold leading-none text-white">
      {label}
    </span>
  );
}

interface HeaderProps {
  catalogNav?: CatalogNavNode[];
}

export function Header({ catalogNav = [] }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [activeRootId, setActiveRootId] = useState<number | null>(
    catalogNav[0]?.id ?? null
  );
  const [mobileCatalogOpenId, setMobileCatalogOpenId] = useState<number | null>(
    null
  );
  const catalogPanelId = useId();
  const { lineCount, ready } = useRequestCart();
  const count = ready ? lineCount : 0;

  useEffect(() => {
    if (!catalogNav.length) return;
    if (!catalogNav.some((root) => root.id === activeRootId)) {
      setActiveRootId(catalogNav[0].id);
    }
  }, [catalogNav, activeRootId]);

  useEffect(() => {
    if (!catalogOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("[data-catalog-flyout-trigger]") ||
        target?.closest("[data-catalog-flyout-panel]")
      ) {
        return;
      }
      setCatalogOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCatalogOpen(false);
    };

    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", onPointerDown);
    }, 0);

    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [catalogOpen]);

  return (
    <header className="relative sticky top-0 z-50 border-b border-slate-200 bg-white/95 text-black shadow-sm backdrop-blur">
      <div className="hidden border-b border-slate-700 bg-slate-900 text-slate-100 md:block">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5 text-sm text-slate-200">
          <span>г. Минск, ул. Шафарнянская, 11, офис 33</span>
          <div className="flex items-center gap-4">
            <a href="tel:+375296656053" className="flex items-center gap-1 transition-colors hover:text-white">
              <Phone className="w-3.5 h-3.5" />
              +375 (29) 665-60-53
            </a>
            <span className="text-slate-500">|</span>
            <a href="mailto:info@teling.by" className="transition-colors hover:text-white">
              info@teling.by
            </a>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image
              src="/teling-circle.webp"
              alt="Логотип ТЕЛИНГ ГРУПП"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
              priority
              sizes="36px"
            />
            <span className="text-xl font-black tracking-wide text-black">
              ТЕЛИНГ ГРУПП
            </span>
          </Link>

          <SearchAutocomplete containerClassName="relative hidden max-w-xl flex-1 md:flex" />

          <nav className="hidden shrink-0 items-center gap-6 text-sm font-semibold md:flex">
            <Link href="/" className="transition-colors hover:text-black/70">
              Главная
            </Link>
            {catalogNav.length > 0 ? (
              <CatalogMegaMenuTrigger
                open={catalogOpen}
                panelId={catalogPanelId}
                onToggle={() => {
                  setCatalogOpen((v) => !v);
                  setMenuOpen(false);
                  setMobileSearchOpen(false);
                }}
              />
            ) : (
              <Link href="/catalog" className="transition-colors hover:text-black/70">
                Каталог
              </Link>
            )}
            <Link
              href="/#contacts"
              className="transition-colors hover:text-black/70"
            >
              Контакты
            </Link>
            <Link
              href="/request"
              className="inline-flex items-center transition-colors hover:text-black/70"
              aria-label={count > 0 ? `Запрос, ${count}` : "Запрос"}
            >
              <ClipboardList className="mr-1.5 h-4 w-4" />
              Запрос
              <CountBadge count={count} variant="inline" />
            </Link>
          </nav>

          <div className="flex items-center gap-1 md:hidden">
            <button
              className="rounded-lg p-2 text-black"
              onClick={() => {
                setMobileSearchOpen((v) => !v);
                setMenuOpen(false);
                setCatalogOpen(false);
              }}
              aria-label="Поиск"
            >
              {mobileSearchOpen ? <X className="h-6 w-6" /> : <Search className="h-6 w-6" />}
            </button>
            <Link
              href="/request"
              className="relative rounded-lg p-2 text-black"
              aria-label={count > 0 ? `Запрос, ${count}` : "Запрос"}
            >
              <ClipboardList className="h-6 w-6" />
              <CountBadge count={count} variant="corner" />
            </Link>
            <button
              className="rounded-lg p-2 text-black"
              onClick={() => {
                setMenuOpen(!menuOpen);
                setMobileSearchOpen(false);
                setCatalogOpen(false);
              }}
              aria-label="Меню"
            >
              {menuOpen ? (
                <X className="w-6 h-6" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {catalogOpen && catalogNav.length > 0 ? (
        <CatalogMegaMenuPanel
          roots={catalogNav}
          activeRootId={activeRootId}
          onActiveRootIdChange={setActiveRootId}
          onClose={() => setCatalogOpen(false)}
          panelId={catalogPanelId}
        />
      ) : null}

      {mobileSearchOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 md:hidden">
          <SearchAutocomplete
            placeholder="Поиск по названию или артикулу…"
            containerClassName="relative"
            inputClassName="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pr-10 text-sm text-black placeholder-slate-400 outline-none"
            onNavigate={() => setMobileSearchOpen(false)}
          />
        </div>
      )}

      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden">
          <nav className="mt-3 flex flex-col gap-3 text-sm font-medium">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-black/70"
            >
              Главная
            </Link>
            <div className="border-t border-b border-slate-100 py-1">
              <div className="flex items-center justify-between gap-2 py-1">
                <Link
                  href="/catalog"
                  onClick={() => setMenuOpen(false)}
                  className="font-semibold hover:text-black/70"
                >
                  Каталог
                </Link>
                <Link
                  href="/catalog"
                  onClick={() => setMenuOpen(false)}
                  className="text-xs font-medium text-slate-600 hover:text-black"
                >
                  Все разделы →
                </Link>
              </div>
              {catalogNav.map((root) => {
                const expanded = mobileCatalogOpenId === root.id;
                return (
                  <div key={root.id} className="border-t border-slate-100">
                    <div className="flex items-start gap-1">
                      <Link
                        href={`/catalog/${root.slug}`}
                        onClick={() => setMenuOpen(false)}
                        className="min-w-0 flex-1 py-2 pr-2 text-sm leading-snug text-black/80 hover:text-black"
                      >
                        {root.name}
                      </Link>
                      {root.children.length > 0 ? (
                        <button
                          type="button"
                          className="mt-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-black"
                          aria-expanded={expanded}
                          aria-label={
                            expanded
                              ? "Свернуть подкатегории"
                              : "Показать подкатегории"
                          }
                          onClick={() =>
                            setMobileCatalogOpenId(expanded ? null : root.id)
                          }
                        >
                          <ChevronDown
                            className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      ) : null}
                    </div>
                    {expanded && root.children.length > 0 ? (
                      <ul className="mb-2 space-y-1 pb-1 pl-3">
                        {root.children.map((child) => (
                          <li key={child.id}>
                            <Link
                              href={`/catalog/${child.slug}`}
                              onClick={() => setMenuOpen(false)}
                              className="block py-1.5 text-sm leading-snug text-black/60 hover:text-black"
                            >
                              {child.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <Link
              href="/#contacts"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-black/70"
            >
              Контакты
            </Link>
            <Link
              href="/request"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center py-1 hover:text-black/70"
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              Запрос
              <CountBadge count={count} variant="inline" />
            </Link>
            <a
              href="tel:+375296656053"
              className="flex items-center gap-2 py-1 text-black"
            >
              <Phone className="w-4 h-4" />
              +375 (29) 665-60-53
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
