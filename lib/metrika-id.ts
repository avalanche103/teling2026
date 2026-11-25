/** Public Yandex Metrika counter for teling.by. Override with NEXT_PUBLIC_YM_COUNTER_ID. */
const FALLBACK_YM_COUNTER_ID = "114684236";

function normalizeCounterId(value: string | undefined): string {
  const id = value?.trim() ?? "";
  return /^\d{5,12}$/.test(id) ? id : "";
}

/**
 * Counter id for the browser tag.
 *
 * NEXT_PUBLIC_* is frozen at `next build`. Production falls back to the live
 * counter so a local build still ships the tag. `next dev` stays quiet unless
 * the variable is set, so localhost does not write into the counter.
 */
export function readYmCounterId(): string {
  const configured = normalizeCounterId(process.env.NEXT_PUBLIC_YM_COUNTER_ID);
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return FALLBACK_YM_COUNTER_ID;
  return "";
}

/** Counter id for the admin report. Dev can read production stats. */
export function readYmReportCounterId(): string {
  return (
    normalizeCounterId(process.env.YANDEX_METRIKA_COUNTER_ID) ||
    normalizeCounterId(process.env.NEXT_PUBLIC_YM_COUNTER_ID) ||
    FALLBACK_YM_COUNTER_ID
  );
}
