import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { LogoutButton } from "@/components/admin/LogoutButton";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Teling Чат",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function OperatorLayout({ children }: { children: ReactNode }) {
  const session = await requireSession(["admin", "employee", "operator"]);
  const { user } = session;

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/teling-circle.webp"
              alt="Teling"
              width={36}
              height={36}
              className="h-9 w-9 rounded-full bg-white"
              priority
            />
            <div>
              <p className="text-base font-bold tracking-tight text-white">Teling Чат</p>
              <p className="text-xs text-slate-400">Операторская панель</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-xs text-slate-400 sm:block">
              <p className="font-medium text-slate-200">{user.name}</p>
              <p>{user.username}</p>
            </div>
            <LogoutButton redirectTo="/login?client=desktop" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 lg:px-6">{children}</main>
    </div>
  );
}
