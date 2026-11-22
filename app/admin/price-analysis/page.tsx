import { PriceAnalysisPanel } from "@/components/admin/PriceAnalysisPanel";
import { requireSession } from "@/lib/auth";

export const metadata = {
  title: "Анализ цен | Admin",
};

export default async function AdminPriceAnalysisPage() {
  await requireSession(["admin", "employee"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Анализ цен</h1>
        <p className="mt-1 text-sm text-slate-500">
          Выдача Яндекс и Google (BY) через XMLRiver: цены из сниппетов, себестоимость из прайса
          Микроинформа, сохранение витринной цены в один клик.
        </p>
      </div>
      <PriceAnalysisPanel />
    </div>
  );
}
