import Link from "next/link";
import type { MetrikaLoadResult, MetrikaStats } from "@/lib/metrika-stats";

const PERIODS = [
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
] as const;

const numberFormat = new Intl.NumberFormat("ru-RU");

function formatCount(value: number): string {
  return numberFormat.format(value);
}

function formatDay(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatRange(stats: MetrikaStats): string {
  return `${formatDay(stats.date1)} — ${formatDay(stats.date2)}`;
}

function safeSitePath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}

export function MetrikaStats({ result }: { result: MetrikaLoadResult }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Статистика</h1>
          <p className="mt-1 text-sm text-slate-500">
            Яндекс Метрика, счётчик {result.counterId}. Админка, вход и операторская панель в
            счётчик не пишутся.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((period) => {
            const selectedDays = result.ok ? result.stats.days : result.days;
            const active = selectedDays === period.days;
            const href = period.days === 30 ? "/admin/stats" : `/admin/stats?days=${period.days}`;
            return (
              <Link
                key={period.days}
                href={href}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {period.label}
              </Link>
            );
          })}
        </div>
      </div>

      {result.ok ? <StatsBody stats={result.stats} /> : <StatsNotice result={result} />}
    </div>
  );
}

function StatsNotice({ result }: { result: Extract<MetrikaLoadResult, { ok: false }> }) {
  const title =
    result.reason === "not_configured"
      ? "Отчёт ещё не подключён"
      : result.reason === "forbidden"
        ? "Нет доступа к счётчику"
        : "Не удалось загрузить отчёт";

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-relaxed text-amber-950">
      <p className="font-semibold">{title}</p>
      {result.reason === "not_configured" ? (
        <p className="mt-2">
          Счётчик на сайте уже стоит. Чтобы видеть посетителей и страницы здесь, добавьте на
          сервер OAuth-токен с правом <span className="font-medium">metrika:read</span> в
          переменную <span className="font-medium">YANDEX_METRIKA_TOKEN</span>.
        </p>
      ) : (
        <p className="mt-2">{result.message}</p>
      )}
      <p className="mt-3">
        <a
          href={`https://metrika.yandex.ru/dashboard?id=${result.counterId}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-amber-950 underline decoration-amber-400 underline-offset-2"
        >
          Открыть счётчик в Метрике
        </a>
      </p>
    </div>
  );
}

function StatsBody({ stats }: { stats: MetrikaStats }) {
  const maxUsers = Math.max(1, ...stats.daily.map((day) => day.users));
  const hasTraffic = stats.users > 0 || stats.visits > 0 || stats.pageviews > 0;

  return (
    <>
      <p className="text-sm text-slate-500">{formatRange(stats)}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Посетители" value={stats.users} hint="Уникальные пользователи" />
        <SummaryCard label="Визиты" value={stats.visits} hint="Заходы на сайт" />
        <SummaryCard label="Просмотры" value={stats.pageviews} hint="Просмотренные страницы" />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Посетители по дням</h2>
        {hasTraffic ? (
          <>
            <div className="mt-4 flex h-36 items-end gap-px">
              {stats.daily.map((day) => (
                <div
                  key={day.date}
                  title={`${formatDay(day.date)}: ${formatCount(day.users)} посетителей, ${formatCount(day.visits)} визитов, ${formatCount(day.pageviews)} просмотров`}
                  className="min-w-0 flex-1 rounded-t bg-sky-600"
                  style={{ height: `${Math.max(day.users > 0 ? 4 : 0, (day.users / maxUsers) * 100)}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>{formatDay(stats.daily[0]?.date ?? stats.date1)}</span>
              <span>{formatDay(stats.daily.at(-1)?.date ?? stats.date2)}</span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">За этот период визитов ещё нет.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Страницы</h2>
        </div>
        {stats.pages.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">За этот период просмотров страниц нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Страница</th>
                  <th className="px-5 py-3 text-right font-semibold">Просмотры</th>
                  <th className="px-5 py-3 text-right font-semibold">Посетители</th>
                </tr>
              </thead>
              <tbody>
                {stats.pages.map((page) => {
                  const href = safeSitePath(page.path);
                  return (
                    <tr key={page.path} className="border-t border-slate-100">
                      <td className="px-5 py-3 font-medium text-slate-800">
                        {href ? (
                          <Link href={href} className="hover:text-sky-700" target="_blank" rel="noreferrer">
                            {page.path}
                          </Link>
                        ) : (
                          page.path
                        )}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {formatCount(page.pageviews)}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {formatCount(page.users)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function SummaryCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{formatCount(value)}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
    </div>
  );
}
