import { ProductsImportManager } from "@/components/admin/ProductsImportManager";
import { ProductsManager } from "@/components/admin/ProductsManager";

export const metadata = {
  title: "Товары | Admin",
};

export default function AdminProductsPage() {
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