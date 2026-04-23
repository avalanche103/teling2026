import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Администрирование | Teling",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 lg:px-6">
          <span className="text-base font-bold tracking-tight">Teling Admin</span>
          <nav className="flex flex-1 items-center gap-1 text-sm">
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Главная
            </Link>
            <Link
              href="/admin/catalog"
              className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Каталог
            </Link>
            <Link
              href="/admin/products"
              className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Товары
            </Link>
          </nav>
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
          >
            ← Сайт
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">{children}</main>
    </div>
  );
}
