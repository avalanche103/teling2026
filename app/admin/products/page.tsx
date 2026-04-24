import { ProductsImportManager } from "@/components/admin/ProductsImportManager";
import { ProductsManager } from "@/components/admin/ProductsManager";
import { requireSession } from "@/lib/auth";

export const metadata = {
  title: "Товары | Admin",
};

export default async function AdminProductsPage() {
  await requireSession(["admin", "employee"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Товары</h1>
        <p className="mt-1 text-sm text-slate-500">
          Управление видимостью, редактированием и импортом товаров из нового JSON.
        </p>
      </div>
      <ProductsImportManager />
      <ProductsManager />
    </div>
  );
}