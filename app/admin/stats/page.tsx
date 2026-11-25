import { MetrikaStats } from "@/components/admin/MetrikaStats";
import { requireSession } from "@/lib/auth";
import { loadMetrikaStats, parseStatDays } from "@/lib/metrika-stats";

export const metadata = {
  title: "Статистика | Admin",
};

export const dynamic = "force-dynamic";

export default async function AdminStatsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireSession(["admin", "employee"]);
  const params = await searchParams;
  const result = await loadMetrikaStats(parseStatDays(params.days));
  return <MetrikaStats result={result} />;
}
