import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Страница не найдена",
  description: "Запрошенная страница не существует или была удалена.",
  robots: {
    index: false,
    follow: true,
  },
  // Do not inherit root layout canonical "/" — that looks like a soft redirect to Google.
  alternates: {
    canonical: null,
  },
};

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">404</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
        Страница не найдена
      </h1>
      <p className="mt-3 max-w-md text-slate-600">
        Такой страницы нет на сайте. Возможно, ссылка устарела после обновления каталога.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          На главную
        </Link>
        <Link
          href="/catalog"
          className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
        >
          В каталог
        </Link>
      </div>
    </main>
  );
}
