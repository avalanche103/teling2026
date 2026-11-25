"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AdminChatBadge } from "@/components/admin/AdminChatBadge";
import { AdminRequestsBadge } from "@/components/admin/AdminRequestsBadge";
import { LogoutButton } from "@/components/admin/LogoutButton";

export interface AdminNavUser {
  name: string;
  username: string;
  role: string;
}

type NavItem = {
  href: string;
  label: string;
  badge?: "requests" | "chat";
};

export function AdminMobileNav({ user }: { user: AdminNavUser }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const canCatalog = user.role === "admin" || user.role === "employee";
  const isAdmin = user.role === "admin";

  const items: NavItem[] = [
    ...(canCatalog
      ? ([
          { href: "/admin/stats", label: "Статистика" },
          { href: "/admin/catalog", label: "Каталог" },
          { href: "/admin/products", label: "Товары" },
          { href: "/admin/content", label: "Контент" },
          { href: "/ssd", label: "SSD база" },
          { href: "/admin/microinform", label: "Микроинформ" },
          { href: "/admin/price-analysis", label: "Анализ цен" },
        ] satisfies NavItem[])
      : []),
    { href: "/admin/requests", label: "Запросы", badge: "requests" },
    { href: "/admin/chat", label: "Чат", badge: "chat" },
    ...(isAdmin ? ([{ href: "/admin/staff", label: "Сотрудники" }] satisfies NavItem[]) : []),
  ];

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Desktop nav */}
      <nav className="hidden flex-1 items-center gap-1 text-sm md:flex">
        {items.map((item) => (
          <NavLink key={item.href} href={item.href} active={isActive(pathname, item.href)}>
            {item.label}
            {item.badge === "requests" && <AdminRequestsBadge />}
            {item.badge === "chat" && <AdminChatBadge />}
          </NavLink>
        ))}
      </nav>

      <div className="ml-auto flex items-center gap-1 md:ml-0 md:contents">
        <div className="hidden text-right text-xs text-slate-400 md:block">
          <p className="font-medium text-slate-200">{user.name}</p>
          <p>
            {user.username} · {user.role}
          </p>
        </div>
        <Link
          href="/"
          className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 hover:bg-slate-700 hover:text-white transition-colors md:inline-flex"
        >
          ← Сайт
        </Link>
        <div className="hidden md:block">
          <LogoutButton />
        </div>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-200 hover:bg-slate-700 md:hidden"
          aria-label={open ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Меню</span>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {open ? (
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            ) : (
              <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Закрыть меню"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-[min(100%,20rem)] flex-col bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {user.username} · {user.role}
                </p>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-slate-300 hover:bg-slate-800"
                aria-label="Закрыть"
                onClick={() => setOpen(false)}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-2 py-3">
              <Link
                href="/admin"
                onClick={() => setOpen(false)}
                className={`mb-1 flex items-center rounded-lg px-3 py-2.5 text-sm font-medium ${
                  pathname === "/admin"
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                Панель управления
              </Link>
              {items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`mb-1 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium ${
                    isActive(pathname, item.href)
                      ? "bg-slate-800 text-white"
                      : "text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="flex items-center">
                    {item.badge === "requests" && <AdminRequestsBadge />}
                    {item.badge === "chat" && <AdminChatBadge />}
                  </span>
                </Link>
              ))}
            </nav>
            <div className="border-t border-slate-800 px-2 py-3 space-y-1">
              <Link
                href="/"
                onClick={() => setOpen(false)}
                className="flex items-center rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
              >
                ← На сайт
              </Link>
              <div className="px-1">
                <LogoutButton />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center rounded-md px-3 py-1.5 font-medium transition-colors ${
        active
          ? "bg-slate-700 text-white"
          : "text-slate-300 hover:bg-slate-700 hover:text-white"
      }`}
    >
      {children}
    </Link>
  );
}
