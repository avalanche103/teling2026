import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AdminChatBadge } from "@/components/admin/AdminChatBadge";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Администрирование | Teling",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const { user } = session;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 lg:px-6">
          <Link href="/admin" className="text-base font-bold tracking-tight text-white hover:text-slate-100 transition-colors">
            Teling Admin
          </Link>
          <nav className="flex flex-1 items-center gap-1 text-sm">
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Главная
            </Link>
            {(user.role === "admin" || user.role === "employee") && (
              <>
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
                <Link
                  href="/admin/content"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  Контент
                </Link>
              </>
            )}
            <Link
              href="/admin/chat"
              className="flex items-center rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Чат
              <AdminChatBadge />
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin/staff"
                className="rounded-md px-3 py-1.5 font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
              >
                Сотрудники
              </Link>
            )}
          </nav>
          <div className="hidden text-right text-xs text-slate-400 sm:block">
            <p className="font-medium text-slate-200">{user.name}</p>
            <p>{user.username} · {user.role}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-6">{children}</main>
    </div>
  );
}
