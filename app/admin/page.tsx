import Link from "next/link";

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
      </div>
    </div>
  );
}
