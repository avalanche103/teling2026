import { StaffManager } from "@/components/admin/StaffManager";
import { requireSession } from "@/lib/auth";

export const metadata = {
  title: "Сотрудники | Admin",
};

export default async function AdminStaffPage() {
  await requireSession(["admin"]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">Сотрудники</h1>
        <p className="mt-1 text-sm text-slate-500">
          Управление учетными записями, ролями доступа и паролями сотрудников.
        </p>
      </div>
      <StaffManager />
    </div>
  );
}