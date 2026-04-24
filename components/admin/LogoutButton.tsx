"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    startTransition(() => {
      router.push("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-50"
    >
      Выйти
    </button>
  );
}