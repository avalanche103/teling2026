import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AdminMobileNav } from "@/components/admin/AdminMobileNav";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Администрирование | Teling",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const { user } = session;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 md:gap-6 lg:px-6">
          <Link
            href="/admin"
            className="shrink-0 text-base font-bold tracking-tight text-white transition-colors hover:text-slate-100"
          >
            Teling Admin
          </Link>
          <AdminMobileNav
            user={{
              name: user.name,
              username: user.username,
              role: user.role,
            }}
          />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8 lg:px-6">{children}</main>
    </div>
  );
}
