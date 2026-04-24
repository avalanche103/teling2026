import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession, getDefaultAdminPath } from "@/lib/auth";

export const metadata = {
  title: "Вход | Teling",
};

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(getDefaultAdminPath(session.user.role));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-400">Teling</p>
          <h1 className="mt-2 text-2xl font-black text-slate-900">Вход в админку</h1>
          <p className="mt-2 text-sm text-slate-500">
            Используйте учетную запись сотрудника для доступа к панели управления.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}