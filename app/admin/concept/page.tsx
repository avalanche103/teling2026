import { ConceptManager } from "@/components/admin/ConceptManager";
import { requireSession } from "@/lib/auth";

export default async function ConceptAdminPage() {
  await requireSession(["admin", "employee"]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Концепт технологии</h1>
        <p className="mt-1 text-sm text-slate-500">
          Импорт KIWI (USD→BYN + наценка) и ассортимент EXFO по запросу
        </p>
      </div>
      <ConceptManager />
    </div>
  );
}
