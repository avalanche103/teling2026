"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ClipboardList, Menu, Phone, X } from "lucide-react";
import { SearchAutocomplete } from "@/components/layout/SearchAutocomplete";
import { useRequestCart } from "@/components/request/RequestCartProvider";

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

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { lineCount, ready } = useRequestCart();
  const count = ready ? lineCount : 0;

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 text-black shadow-sm backdrop-blur">
      {/* Top bar */}
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

      {/* Main nav */}
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <Image
              src="/teling-circle.jpg"
              alt="Логотип ТЕЛИНГ ГРУПП"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full object-cover"
              priority
            />
            <span className="text-xl font-black tracking-wide text-black">
              ТЕЛИНГ ГРУПП
            </span>
          </Link>

          {/* Search bar (desktop) */}
          <SearchAutocomplete containerClassName="relative hidden max-w-xl flex-1 md:flex" />

          {/* Desktop nav links */}
          <nav className="hidden shrink-0 items-center gap-6 text-sm font-semibold md:flex">
            <Link href="/" className="transition-colors hover:text-black/70">
              Главная
            </Link>
            <Link
              href="/catalog"
              className="transition-colors hover:text-black/70"
            >
              Каталог
            </Link>
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

          {/* Mobile: request icon + burger — badge on icon corner (compact, always visible) */}
          <div className="flex items-center gap-1 md:hidden">
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
              onClick={() => setMenuOpen(!menuOpen)}
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

      {/* Mobile menu */}
      {menuOpen && (
        <div className="border-t border-slate-200 bg-white px-4 pb-4 md:hidden">
          <SearchAutocomplete
            placeholder="Поиск…"
            containerClassName="relative mt-4 mb-3"
            inputClassName="w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pr-10 text-sm text-black placeholder-slate-400 outline-none"
            onNavigate={() => setMenuOpen(false)}
          />
          <nav className="flex flex-col gap-3 text-sm font-medium">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-black/70"
            >
              Главная
            </Link>
            <Link
              href="/catalog"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-black/70"
            >
              Каталог
            </Link>
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
