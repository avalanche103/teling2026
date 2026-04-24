import { AdminChatPanel } from "@/components/admin/AdminChatPanel";

export default function AdminChatPage() {
  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-800">Чат с посетителями</h1>
      <AdminChatPanel />
    </div>
  );
}
