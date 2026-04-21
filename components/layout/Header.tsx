"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { SearchAutocomplete } from "@/components/layout/SearchAutocomplete";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 text-black shadow-sm backdrop-blur">
      {/* Top bar */}
      <div className="hidden border-b border-slate-700 bg-slate-900 text-slate-100 md:block">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5 text-sm text-slate-200">
          <span>г. Минск, ул. Шафарнянская, 11, офис 33</span>
          <div className="flex items-center gap-4">
            <a href="tel:+375172705095" className="flex items-center gap-1 transition-colors hover:text-white">
              <Phone className="w-3.5 h-3.5" />
              +375 (17) 270-50-95
            </a>
            <span className="text-slate-500">|</span>
            <span>Пн–Пт 9:00–18:00</span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
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
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="text-black md:hidden"
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
            <a
              href="tel:+375172705095"
              className="flex items-center gap-2 py-1 text-black"
            >
              <Phone className="w-4 h-4" />
              +375 (17) 270-50-95
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
