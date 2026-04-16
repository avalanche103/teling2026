import { CatalogTree } from "@/components/admin/CatalogTree";

export const metadata = {
  title: "Структура каталога | Admin",
};

export default function AdminCatalogPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Структура каталога</h1>
        <p className="mt-1 text-sm text-slate-500">
          Просмотр и редактирование дерева разделов. Используйте кнопки рядом с каждым разделом
          для добавления дочерних элементов, редактирования или удаления.
        </p>
      </div>
      <CatalogTree />
    </div>
  );
}
