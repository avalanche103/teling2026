"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type {
  MetrikaLoadResult,
  MetrikaPeriodStats,
  MetrikaStats,
} from "@/lib/metrika-stats";

const PRESETS = [
  { days: 1, label: "Сегодня" },
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

function formatRange(date1: string, date2: string): string {
  if (date1 === date2) return formatDay(date1);
  return `${formatDay(date1)} — ${formatDay(date2)}`;
}

function formatSigned(value: number): string {
  const abs = formatCount(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

function formatPct(value: number | null): string {
  if (value == null) return "н/д";
  if (value > 0) return `+${value}%`;
  if (value < 0) return `−${Math.abs(value)}%`;
  return "0%";
}

function deltaTone(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-slate-500";
}

function safeSitePath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return null;
  return path;
}

function buildStatsHref(opts: {
  days?: number | null;
  from?: string;
  to?: string;
  compare: boolean;
}): string {
  const p = new URLSearchParams();
  if (opts.from && opts.to) {
    p.set("from", opts.from);
    p.set("to", opts.to);
  } else if (opts.days && opts.days !== 1) {
    p.set("days", String(opts.days));
  }
  if (!opts.compare) p.set("compare", "0");
  const qs = p.toString();
  return qs ? `/admin/stats?${qs}` : "/admin/stats";
}

function activePresetDays(result: MetrikaLoadResult): 1 | 7 | 30 | 90 | null {
  const date1 = result.ok ? result.stats.current.date1 : result.date1;
  const date2 = result.ok ? result.stats.current.date2 : result.date2;
  const today = result.ok
    ? result.stats.current.date2
    : result.date2;
  // Preset only when range ends on the resolved "to" of the report and matches length.
  const days = result.ok ? result.stats.current.days : daySpan(date1, date2);
  if (date2 !== today) return null;
  if (days === 1 || days === 7 || days === 30 || days === 90) return days;
  return null;
}

function daySpan(date1: string, date2: string): number {
  const a = Date.parse(`${date1}T00:00:00Z`);
  const b = Date.parse(`${date2}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.round((b - a) / 86_400_000) + 1;
}

export function MetrikaStats({ result }: { result: MetrikaLoadResult }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const compare = result.ok ? result.stats.compare : result.compare;
  const date1 = result.ok ? result.stats.current.date1 : result.date1;
  const date2 = result.ok ? result.stats.current.date2 : result.date2;
  const [from, setFrom] = useState(date1);
  const [to, setTo] = useState(date2);
  const preset = activePresetDays(result);

  const navigate = (href: string) => {
    startTransition(() => {
      router.push(href);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Статистика</h1>
          <p className="mt-1 text-sm text-slate-500">
            Яндекс Метрика, счётчик {result.counterId}. Админка, вход и операторская панель в
            счётчик не пишутся.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((period) => {
            const active = preset === period.days;
            const href = buildStatsHref({ days: period.days, compare });
            return (
              <button
                key={period.days}
                type="button"
                disabled={pending}
                onClick={() => navigate(href)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {period.label}
              </button>
            );
          })}
        </div>
      </div>

      <form
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(buildStatsHref({ from, to, compare }));
        }}
      >
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">С</span>
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
          />
        </label>
        <label className="flex min-w-[9rem] flex-1 flex-col gap-1 text-sm">
          <span className="font-medium text-slate-600">По</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-slate-200 px-3 py-2 text-slate-900"
          />
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm font-medium text-slate-700">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) =>
              navigate(
                buildStatsHref({
                  from,
                  to,
                  days: preset,
                  compare: e.target.checked,
                }),
              )
            }
            className="size-4 rounded border-slate-300"
          />
          Сравнить с прошлым периодом
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          Показать
        </button>
      </form>

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
        : result.reason === "bad_range"
          ? "Некорректный период"
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
  const current = stats.current;
  const previous = stats.previous;
  const delta = stats.delta;
  const maxUsers = Math.max(
    1,
    ...current.daily.map((day) => day.users),
    ...(previous?.daily.map((day) => day.users) ?? []),
  );
  const hasTraffic = current.users > 0 || current.visits > 0 || current.pageviews > 0;

  return (
    <>
      <div className="flex flex-col gap-1 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Период: <span className="font-medium text-slate-700">{formatRange(current.date1, current.date2)}</span>
          {current.days === 1 ? " (день)" : ` · ${current.days} дн.`}
        </p>
        {previous ? (
          <p>
            Сравнение с{" "}
            <span className="font-medium text-slate-700">
              {formatRange(previous.date1, previous.date2)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Посетители"
          value={current.users}
          previous={previous?.users}
          deltaAbs={delta?.users}
          deltaPct={delta?.usersPct ?? null}
          hint="Уникальные пользователи"
        />
        <SummaryCard
          label="Визиты"
          value={current.visits}
          previous={previous?.visits}
          deltaAbs={delta?.visits}
          deltaPct={delta?.visitsPct ?? null}
          hint="Заходы на сайт"
        />
        <SummaryCard
          label="Просмотры"
          value={current.pageviews}
          previous={previous?.pageviews}
          deltaAbs={delta?.pageviews}
          deltaPct={delta?.pageviewsPct ?? null}
          hint="Просмотренные страницы"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-900">Посетители по дням</h2>
          {previous ? (
            <div className="flex gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-sky-600" /> Текущий
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-slate-300" /> Прошлый
              </span>
            </div>
          ) : null}
        </div>
        {hasTraffic || (previous && previous.users > 0) ? (
          <>
            <div className="mt-4 flex h-40 items-end gap-1">
              {current.daily.map((day, index) => {
                const prevDay = previous?.daily[index];
                return (
                  <div key={day.date} className="flex min-w-0 flex-1 items-end gap-px">
                    {prevDay ? (
                      <div
                        title={`Прошлый ${formatDay(prevDay.date)}: ${formatCount(prevDay.users)}`}
                        className="min-w-0 flex-1 rounded-t bg-slate-300"
                        style={{
                          height: `${Math.max(prevDay.users > 0 ? 4 : 0, (prevDay.users / maxUsers) * 100)}%`,
                        }}
                      />
                    ) : null}
                    <div
                      title={`${formatDay(day.date)}: ${formatCount(day.users)} посетителей, ${formatCount(day.visits)} визитов, ${formatCount(day.pageviews)} просмотров`}
                      className="min-w-0 flex-1 rounded-t bg-sky-600"
                      style={{
                        height: `${Math.max(day.users > 0 ? 4 : 0, (day.users / maxUsers) * 100)}%`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-400">
              <span>{formatDay(current.daily[0]?.date ?? current.date1)}</span>
              <span>{formatDay(current.daily.at(-1)?.date ?? current.date2)}</span>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-500">За этот период визитов ещё нет.</p>
        )}
      </section>

      <PagesTable current={current} />
    </>
  );
}

function PagesTable({ current }: { current: MetrikaPeriodStats }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-bold text-slate-900">Страницы</h2>
      </div>
      {current.pages.length === 0 ? (
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
              {current.pages.map((page) => {
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
  );
}

function SummaryCard({
  label,
  value,
  previous,
  deltaAbs,
  deltaPct,
  hint,
}: {
  label: string;
  value: number;
  previous?: number;
  deltaAbs?: number;
  deltaPct: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{formatCount(value)}</p>
      {typeof deltaAbs === "number" ? (
        <p className={`mt-2 text-sm font-semibold tabular-nums ${deltaTone(deltaAbs)}`}>
          {formatSigned(deltaAbs)}
          <span className="ml-1 font-medium">({formatPct(deltaPct)})</span>
          {typeof previous === "number" ? (
            <span className="mt-0.5 block text-xs font-normal text-slate-400">
              было {formatCount(previous)}
            </span>
          ) : null}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">{hint}</p>
      )}
    </div>
  );
}
