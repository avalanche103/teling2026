import { RequestsManager } from "@/components/admin/RequestsManager";
import { requireSession } from "@/lib/auth";

export default async function AdminRequestsPage() {
  await requireSession(["admin", "employee", "operator"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Запросы</h1>
        <p className="mt-1 text-sm text-slate-500">
          Запросы с сайта: контакты организации и подобранные позиции
        </p>
      </div>
      <RequestsManager />
    </div>
  );
}
