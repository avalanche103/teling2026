import { AdminChatPanel } from "@/components/admin/AdminChatPanel";
import { requireSession } from "@/lib/auth";

export default async function AdminChatPage() {
  await requireSession(["admin", "employee", "operator"]);

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-800">Чат с посетителями</h1>
      <AdminChatPanel />
    </div>
  );
}
