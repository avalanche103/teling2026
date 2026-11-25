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

export type MetrikaPeriodStats = {
  date1: string;
  date2: string;
  days: number;
  users: number;
  visits: number;
  pageviews: number;
  daily: MetrikaDay[];
  pages: MetrikaPage[];
};

export type MetrikaDelta = {
  users: number;
  visits: number;
  pageviews: number;
  usersPct: number | null;
  visitsPct: number | null;
  pageviewsPct: number | null;
};

export type MetrikaStats = {
  counterId: string;
  fetchedAt: string;
  compare: boolean;
  current: MetrikaPeriodStats;
  previous: MetrikaPeriodStats | null;
  delta: MetrikaDelta | null;
};

export type MetrikaLoadResult =
  | { ok: true; stats: MetrikaStats }
  | {
      ok: false;
      reason: "not_configured" | "forbidden" | "error" | "bad_range";
      counterId: string;
      message: string;
      date1: string;
      date2: string;
      compare: boolean;
    };

export type MetrikaRangeInput = {
  from?: string | string[];
  to?: string | string[];
  days?: string | string[];
  compare?: string | string[];
};

type MetrikaTable = {
  data?: { dimensions?: { name?: string }[]; metrics?: number[] }[];
  totals?: number[];
  message?: string;
  errors?: { message?: string }[];
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_RANGE_DAYS = 366;
const cache = new Map<string, { expires: number; stats: MetrikaStats }>();

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
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

export function isIsoDate(value: string | undefined | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function dayCountInclusive(date1: string, date2: string): number {
  return eachIsoDate(date1, date2).length;
}

export function parseCompareFlag(raw: string | string[] | undefined): boolean {
  const value = (firstParam(raw) || "").trim().toLowerCase();
  if (!value) return true;
  return !(value === "0" || value === "false" || value === "off" || value === "no");
}

/** Resolve report range from query: custom from/to, or days preset (1/7/30/90). */
export function resolveMetrikaRange(input: MetrikaRangeInput = {}): {
  date1: string;
  date2: string;
  compare: boolean;
  presetDays: 1 | 7 | 30 | 90 | null;
} {
  const today = minskTodayIso();
  const compare = parseCompareFlag(input.compare);
  const from = (firstParam(input.from) || "").trim();
  const to = (firstParam(input.to) || "").trim();

  if (isIsoDate(from) || isIsoDate(to)) {
    let date1 = isIsoDate(from) ? from : isIsoDate(to) ? to : today;
    let date2 = isIsoDate(to) ? to : isIsoDate(from) ? from : today;
    if (date1 > date2) [date1, date2] = [date2, date1];
    if (date2 > today) date2 = today;
    if (date1 > today) date1 = today;
    const span = dayCountInclusive(date1, date2);
    if (span > MAX_RANGE_DAYS) {
      date1 = shiftIsoDate(date2, -(MAX_RANGE_DAYS - 1));
    }
    const days = dayCountInclusive(date1, date2);
    const presetDays =
      date2 === today && (days === 1 || days === 7 || days === 30 || days === 90)
        ? (days as 1 | 7 | 30 | 90)
        : null;
    return { date1, date2, compare, presetDays };
  }

  const daysRaw = (firstParam(input.days) || "1").trim();
  let presetDays: 1 | 7 | 30 | 90 = 1;
  if (daysRaw === "7") presetDays = 7;
  else if (daysRaw === "30") presetDays = 30;
  else if (daysRaw === "90") presetDays = 90;
  else presetDays = 1;

  const date2 = today;
  const date1 = shiftIsoDate(date2, -(presetDays - 1));
  return { date1, date2, compare, presetDays };
}

/** @deprecated use resolveMetrikaRange */
export function parseStatDays(raw: string | undefined): 7 | 30 | 90 {
  if (raw === "7") return 7;
  if (raw === "90") return 90;
  return 30;
}

function metricAt(row: number[] | undefined, index: number): number {
  const value = row?.[index];
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function buildDelta(current: MetrikaPeriodStats, previous: MetrikaPeriodStats): MetrikaDelta {
  return {
    users: current.users - previous.users,
    visits: current.visits - previous.visits,
    pageviews: current.pageviews - previous.pageviews,
    usersPct: pctChange(current.users, previous.users),
    visitsPct: pctChange(current.visits, previous.visits),
    pageviewsPct: pctChange(current.pageviews, previous.pageviews),
  };
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

async function fetchPeriodStats(
  token: string,
  counterId: string,
  date1: string,
  date2: string,
): Promise<MetrikaPeriodStats> {
  const common = {
    ids: counterId,
    date1,
    date2,
    accuracy: "full",
    lang: "ru",
  };

  const daySpan = dayCountInclusive(date1, date2);
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
      limit: String(Math.min(400, Math.max(31, daySpan))),
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
  return {
    date1,
    date2,
    days: daySpan,
    users: metricAt(totals, 0),
    visits: metricAt(totals, 1),
    pageviews: metricAt(totals, 2),
    daily,
    pages,
  };
}

export async function loadMetrikaStats(
  input: MetrikaRangeInput | 7 | 30 | 90 = {},
): Promise<MetrikaLoadResult> {
  const rangeInput: MetrikaRangeInput =
    typeof input === "number" ? { days: String(input) } : input;
  const { date1, date2, compare } = resolveMetrikaRange(rangeInput);
  const counterId = readYmReportCounterId();
  const token = process.env.YANDEX_METRIKA_TOKEN?.trim() ?? "";

  if (!token) {
    return {
      ok: false,
      reason: "not_configured",
      counterId,
      date1,
      date2,
      compare,
      message: "Не задан YANDEX_METRIKA_TOKEN",
    };
  }

  if (date1 > date2) {
    return {
      ok: false,
      reason: "bad_range",
      counterId,
      date1,
      date2,
      compare,
      message: "Дата начала позже даты конца",
    };
  }

  const days = dayCountInclusive(date1, date2);
  const prevDate2 = shiftIsoDate(date1, -1);
  const prevDate1 = shiftIsoDate(prevDate2, -(days - 1));
  const cacheKey = `${counterId}:${date1}:${date2}:c${compare ? 1 : 0}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return { ok: true, stats: cached.stats };
  }

  try {
    const currentPromise = fetchPeriodStats(token, counterId, date1, date2);
    const previousPromise = compare
      ? fetchPeriodStats(token, counterId, prevDate1, prevDate2)
      : Promise.resolve(null);

    const [current, previous] = await Promise.all([currentPromise, previousPromise]);
    const stats: MetrikaStats = {
      counterId,
      fetchedAt: new Date().toISOString(),
      compare,
      current,
      previous,
      delta: previous ? buildDelta(current, previous) : null,
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
        date1,
        date2,
        compare,
        message: "Токен не имеет доступа к этому счётчику. Нужно право metrika:read.",
      };
    }
    return {
      ok: false,
      reason: "error",
      counterId,
      date1,
      date2,
      compare,
      message,
    };
  }
}
