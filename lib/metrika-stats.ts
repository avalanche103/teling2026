import { isGaExcludedPath } from "@/lib/ga-exclude";
import { readYmReportCounterId } from "@/lib/metrika-id";

export type MetrikaDay = {
  date: string;
  users: number;
  visits: number;
  pageviews: number;
};

export type MetrikaPage = {
  path: string;
  pageviews: number;
  users: number;
};

export type MetrikaStats = {
  counterId: string;
  date1: string;
  date2: string;
  days: number;
  fetchedAt: string;
  users: number;
  visits: number;
  pageviews: number;
  daily: MetrikaDay[];
  pages: MetrikaPage[];
};

export type MetrikaLoadResult =
  | { ok: true; stats: MetrikaStats }
  | {
      ok: false;
      reason: "not_configured" | "forbidden" | "error";
      counterId: string;
      message: string;
      days: 7 | 30 | 90;
    };

type MetrikaTable = {
  data?: { dimensions?: { name?: string }[]; metrics?: number[] }[];
  totals?: number[];
  message?: string;
  errors?: { message?: string }[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { expires: number; stats: MetrikaStats }>();

export function parseStatDays(raw: string | undefined): 7 | 30 | 90 {
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

export function minskTodayIso(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Minsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftIsoDate(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachIsoDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < 400) {
    dates.push(cursor);
    if (cursor === to) break;
    cursor = shiftIsoDate(cursor, 1);
  }
  return dates;
}

function metricAt(row: number[] | undefined, index: number): number {
  const value = row?.[index];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

export function displayStatPath(name: string): string {
  const raw = name.trim();
  if (!raw) return "/";
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    try {
      return new URL(raw).pathname || "/";
    } catch {
      return raw;
    }
  }
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function isHiddenStatPath(path: string): boolean {
  return isGaExcludedPath(path) || path === "/api" || path.startsWith("/api/");
}

function errorMessage(body: MetrikaTable | null, status: number): string {
  const fromErrors = body?.errors?.map((item) => item.message?.trim()).filter(Boolean).join("; ");
  if (fromErrors) return fromErrors;
  if (body?.message?.trim()) return body.message.trim();
  return `Метрика ответила с кодом ${status}`;
}

async function metrikaQuery(
  token: string,
  params: Record<string, string>,
): Promise<MetrikaTable> {
  const url = new URL("https://api-metrika.yandex.net/stat/v1/data");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { Authorization: `OAuth ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: MetrikaTable | null = null;
  try {
    body = JSON.parse(text) as MetrikaTable;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const error = new Error(errorMessage(body, response.status)) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return body ?? {};
}

export async function loadMetrikaStats(days: 7 | 30 | 90): Promise<MetrikaLoadResult> {
  const counterId = readYmReportCounterId();
  const token = process.env.YANDEX_METRIKA_TOKEN?.trim() ?? "";
  if (!token) {
    return {
      ok: false,
      reason: "not_configured",
      counterId,
      days,
      message: "Не задан YANDEX_METRIKA_TOKEN",
    };
  }

  const date2 = minskTodayIso();
  const date1 = shiftIsoDate(date2, -(days - 1));
  const cacheKey = `${counterId}:${date1}:${date2}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { ok: true, stats: cached.stats };
  }

  const common = {
    ids: counterId,
    date1,
    date2,
    accuracy: "full",
    lang: "ru",
  };

  try {
    const [summary, dailyTable, pagesTable] = await Promise.all([
      metrikaQuery(token, {
        ...common,
        metrics: "ym:s:users,ym:s:visits,ym:s:pageviews",
      }),
      metrikaQuery(token, {
        ...common,
        metrics: "ym:s:users,ym:s:visits,ym:s:pageviews",
        dimensions: "ym:s:date",
        sort: "ym:s:date",
        limit: "100",
      }),
      metrikaQuery(token, {
        ...common,
        metrics: "ym:pv:pageviews,ym:pv:users",
        dimensions: "ym:pv:URLPath",
        sort: "-ym:pv:pageviews",
        limit: "40",
      }),
    ]);

    const byDate = new Map<string, MetrikaDay>();
    for (const row of dailyTable.data ?? []) {
      const date = row.dimensions?.[0]?.name?.slice(0, 10) ?? "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      byDate.set(date, {
        date,
        users: metricAt(row.metrics, 0),
        visits: metricAt(row.metrics, 1),
        pageviews: metricAt(row.metrics, 2),
      });
    }

    const daily = eachIsoDate(date1, date2).map(
      (date) => byDate.get(date) ?? { date, users: 0, visits: 0, pageviews: 0 },
    );

    const pages: MetrikaPage[] = [];
    for (const row of pagesTable.data ?? []) {
      const path = displayStatPath(row.dimensions?.[0]?.name ?? "");
      if (isHiddenStatPath(path)) continue;
      pages.push({
        path,
        pageviews: metricAt(row.metrics, 0),
        users: metricAt(row.metrics, 1),
      });
      if (pages.length >= 20) break;
    }

    const totals = summary.totals ?? summary.data?.[0]?.metrics;
    const stats: MetrikaStats = {
      counterId,
      date1,
      date2,
      days,
      fetchedAt: new Date().toISOString(),
      users: metricAt(totals, 0),
      visits: metricAt(totals, 1),
      pageviews: metricAt(totals, 2),
      daily,
      pages,
    };
    cache.set(cacheKey, { expires: Date.now() + CACHE_TTL_MS, stats });
    return { ok: true, stats };
  } catch (error) {
    const status = (error as { status?: number }).status;
    const message = error instanceof Error ? error.message : "Не удалось получить отчёт Метрики";
    if (status === 401 || status === 403) {
      return {
        ok: false,
        reason: "forbidden",
        counterId,
        days,
        message: "Токен не имеет доступа к этому счётчику. Нужно право metrika:read.",
      };
    }
    return { ok: false, reason: "error", counterId, days, message };
  }
}
