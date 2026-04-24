import { getSession } from "@/lib/auth";
import { ContentManager } from "@/components/admin/ContentManager";
import { redirect } from "next/navigation";

export default async function ContentPage() {
  const session = await getSession();

  if (!session || !["admin", "employee"].includes(session.user.role)) {
    redirect("/login");
  }

  return (
    <div>
      <h1 className="mb-6 text-3xl font-bold text-slate-900">Управление контентом</h1>
      <ContentManager />
    </div>
  );
}
