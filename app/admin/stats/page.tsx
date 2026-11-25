import { MetrikaStats } from "@/components/admin/MetrikaStats";
import { requireSession } from "@/lib/auth";
import { loadMetrikaStats } from "@/lib/metrika-stats";

export const metadata = {
  title: "Статистика | Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    compare?: string;
  }>;
}) {
  await requireSession(["admin", "employee"]);
  const params = await searchParams;
  const result = await loadMetrikaStats({
    days: params.days,
    from: params.from,
    to: params.to,
    compare: params.compare,
  });
  return <MetrikaStats result={result} />;
}
