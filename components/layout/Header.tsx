"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X, Phone, Search } from "lucide-react";
import { useRouter } from "next/navigation";

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/catalog?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
    }
  }

  return (
    <header className="sticky top-0 z-50 border-b border-red-200 bg-white/95 text-red-950 shadow-sm backdrop-blur">
      {/* Top bar */}
      <div className="hidden border-b border-red-200/80 bg-red-700 text-red-50 md:block">
        <div className="container mx-auto flex items-center justify-between px-4 py-1.5 text-sm text-red-100">
          <span>г. Минск, ул. Шафарнянская, 11, офис 33</span>
          <div className="flex items-center gap-4">
            <a href="tel:+375172705095" className="flex items-center gap-1 transition-colors hover:text-white">
              <Phone className="w-3.5 h-3.5" />
              +375 (17) 270-50-95
            </a>
            <span className="text-red-200/70">|</span>
            <span>Пн–Пт 9:00–18:00</span>
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 shrink-0">
            <div className="flex flex-col leading-none">
              <span className="text-xl font-black tracking-wide text-red-700">
                ТЕЛИНГ
              </span>
              <span className="text-xs font-medium uppercase tracking-widest text-red-500">
                групп
              </span>
            </div>
          </Link>

          {/* Search bar (desktop) */}
          <form
            onSubmit={handleSearch}
            className="relative hidden max-w-xl flex-1 md:flex"
          >
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по названию или артикулу…"
              className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 pr-10 text-sm text-red-950 placeholder-red-300 outline-none transition-colors focus:border-red-500"
            />
            <button
              type="submit"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400 hover:text-red-600"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

          {/* Desktop nav links */}
          <nav className="hidden shrink-0 items-center gap-6 text-sm font-semibold md:flex">
            <Link href="/" className="transition-colors hover:text-red-600">
              Главная
            </Link>
            <Link
              href="/catalog"
              className="transition-colors hover:text-red-600"
            >
              Каталог
            </Link>
            <Link
              href="/#contacts"
              className="transition-colors hover:text-red-600"
            >
              Контакты
            </Link>
          </nav>

          {/* Mobile menu toggle */}
          <button
            className="text-red-700 md:hidden"
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
        <div className="border-t border-red-200 bg-white px-4 pb-4 md:hidden">
          <form onSubmit={handleSearch} className="relative mt-4 mb-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск…"
              className="w-full rounded-lg border border-red-200 bg-white px-4 py-2 pr-10 text-sm text-red-950 placeholder-red-300 outline-none"
            />
            <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400">
              <Search className="w-4 h-4" />
            </button>
          </form>
          <nav className="flex flex-col gap-3 text-sm font-medium">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-red-600"
            >
              Главная
            </Link>
            <Link
              href="/catalog"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-red-600"
            >
              Каталог
            </Link>
            <Link
              href="/#contacts"
              onClick={() => setMenuOpen(false)}
              className="py-1 hover:text-red-600"
            >
              Контакты
            </Link>
            <a
              href="tel:+375172705095"
              className="flex items-center gap-2 py-1 text-red-700"
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
