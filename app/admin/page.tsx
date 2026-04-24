import Link from "next/link";
import { AdminChatBadge } from "@/components/admin/AdminChatBadge";

export default function AdminDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Панель управления</h1>
        <p className="mt-1 text-sm text-slate-500">
          Управление структурой сайта и каталогом продукции
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/admin/catalog"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-2xl">
              🗂
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 group-hover:text-blue-700">
                Структура каталога
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Управление разделами и подразделами каталога — добавление, редактирование, удаление, сортировка
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/products"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 text-2xl">
              📦
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 group-hover:text-emerald-700">
                Товары
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Поиск товаров и управление их видимостью на сайте через чекбоксы
              </p>
            </div>
          </div>
        </Link>

        <Link
          href="/admin/chat"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700 text-2xl">
              💬
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-violet-700">
                  Чат
                </h2>
                <AdminChatBadge />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Диалоги с посетителями сайта — просмотр сообщений и ответы в режиме реального времени
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
