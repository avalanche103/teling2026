import Link from "next/link";
import { AdminChatBadge } from "@/components/admin/AdminChatBadge";
import { AdminRequestsBadge } from "@/components/admin/AdminRequestsBadge";
import { requireSession } from "@/lib/auth";

export default async function AdminDashboard() {
  const { user } = await requireSession();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Панель управления</h1>
        <p className="mt-1 text-sm text-slate-500">
          Управление структурой сайта и каталогом продукции
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(user.role === "admin" || user.role === "employee") && (
          <>
            <Link
              href="/admin/stats"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-700 text-2xl">
                  📊
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-sky-700">
                    Статистика
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Посетители и страницы из Яндекс Метрики
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/catalog"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700 text-2xl">
                  🗂
                </div>
                <div className="min-w-0">
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
                <div className="min-w-0">
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
              href="/admin/content"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-700 text-2xl">
                  📝
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-rose-700">
                    Контент
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Управление текстовыми блоками: основной баннер, о компании и контакты
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/ssd"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-100 text-cyan-700 text-2xl">
                  🛠
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-cyan-700">
                    SSD база
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Отдельное SSD-приложение для импорта и правок продуктовой базы, доступное по адресу /ssd
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/microinform"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 text-2xl">
                  📡
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700">
                    Микроинформ
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Прайс партнёра, выбор вендоров, маппинг разделов и публикация товаров на сайт
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/concept"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 text-2xl">
                  🔌
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-amber-700">
                    Концепт технологии
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    KIWI прайс в $, курс и наценка; EXFO по запросу; публикация на сайт
                  </p>
                </div>
              </div>
            </Link>

            <Link
              href="/admin/price-analysis"
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-100 text-teal-700 text-2xl">
                  💹
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-bold text-slate-900 group-hover:text-teal-700">
                    Анализ цен
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Выдача Яндекс/Google, цены из сниппетов, себестоимость и сохранение цены в один клик
                  </p>
                </div>
              </div>
            </Link>
          </>
        )}

        <Link
          href="/admin/requests"
          className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-100 text-orange-700 text-2xl">
              📋
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-orange-700">
                  Запросы
                </h2>
                <AdminRequestsBadge />
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Запросы с сайта — контакты организации и подобранные позиции из каталога
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
            <div className="min-w-0 flex-1">
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

        {user.role === "admin" && (
          <Link
            href="/admin/staff"
            className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-400 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700 text-2xl">
                👥
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-900 group-hover:text-amber-700">
                  Сотрудники
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Учетные записи сотрудников, роли доступа и смена паролей.
                </p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
