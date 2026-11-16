import { MicroinformManager } from "@/components/admin/MicroinformManager";
import { requireSession } from "@/lib/auth";

export default async function AdminMicroinformPage() {
  await requireSession(["admin", "employee"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Микроинформ</h1>
        <p className="mt-1 text-sm text-slate-500">
          Загрузка прайса, выбор вендоров, маппинг в рубрикатор и публикация на сайт
        </p>
      </div>
      <MicroinformManager />
    </div>
  );
}
