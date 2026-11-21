import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession, getDefaultAdminPath } from "@/lib/auth";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Вход | Teling",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const params = await searchParams;
  const isDesktopClient = params.client === "desktop";
  const session = await getSession();
  if (session) {
    redirect(isDesktopClient ? "/operator/chat" : getDefaultAdminPath(session.user.role));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          {isDesktopClient ? (
            <div className="mb-4 flex items-center gap-3">
              <Image
                src="/teling-circle.webp"
                alt="Teling"
                width={48}
                height={48}
                className="h-12 w-12 rounded-full"
                priority
              />
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Teling
                </p>
                <h1 className="text-2xl font-black text-slate-900">Чат оператора</h1>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">
                Teling
              </p>
              <h1 className="mt-2 text-2xl font-black text-slate-900">Вход в админку</h1>
            </>
          )}
          <p className="mt-2 text-sm text-slate-500">
            {isDesktopClient
              ? "Войдите учётной записью сотрудника, чтобы отвечать в чате."
              : "Используйте учетную запись сотрудника для доступа к панели управления."}
          </p>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500">Загрузка…</p>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
