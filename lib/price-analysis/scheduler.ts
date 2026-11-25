import { watchlistItemToProductRaw } from "./lookup";
import { scanProducts } from "./scan";
import { isXmlRiverConfigured } from "./serp-xmlriver";
import {
  mergeCacheResults,
  readCache,
  readScheduler,
  readWatchlist,
  writeCache,
  writeScheduler,
} from "./store";
import type { PriceAnalysisSchedulerState } from "./types";

export const BATCH_SIZE = 10;
/** Minimum gap between batches (cron is hourly; 55m avoids double-fire). */
export const MIN_BATCH_GAP_MS = 55 * 60 * 1000;

export function isoWeekKey(date = new Date()): string {
  // ISO week: Thursday-based year + week number
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function emptyForWeek(weekKey: string): PriceAnalysisSchedulerState {
  return {
    weekKey,
    status: "idle",
    cursor: 0,
    total: 0,
    lastBatchAt: null,
    lastError: null,
    lastScannedIds: [],
  };
}

export function getSchedulerPublicStatus() {
  const state = readScheduler();
  const watchlist = readWatchlist();
  const total = watchlist.items.length;
  return {
    ...state,
    total: total || state.total,
    batchSize: BATCH_SIZE,
    configured: isXmlRiverConfigured(),
    currentWeekKey: isoWeekKey(),
  };
}

export type CronTickResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  scanned: number;
  cursor: number;
  total: number;
  status: PriceAnalysisSchedulerState["status"];
  weekKey: string;
  productIds: number[];
  error?: string;
};

/**
 * One hourly tick: on ISO week change start running immediately, then process
 * BATCH_SIZE items if enough time passed since last batch.
 */
export async function runSchedulerTick(now = new Date()): Promise<CronTickResult> {
  const weekKey = isoWeekKey(now);
  let state = readScheduler();
  const watchlist = readWatchlist();
  const total = watchlist.items.length;

  if (!isXmlRiverConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: "xmlriver_not_configured",
      scanned: 0,
      cursor: state.cursor,
      total,
      status: state.status,
      weekKey: state.weekKey || weekKey,
      productIds: [],
      error: "XMLRiver не настроен",
    };
  }

  if (total === 0) {
    state = {
      ...emptyForWeek(weekKey),
      status: "done",
      lastError: "watchlist пуст",
    };
    writeScheduler(state);
    return {
      ok: true,
      skipped: true,
      reason: "empty_watchlist",
      scanned: 0,
      cursor: 0,
      total: 0,
      status: "done",
      weekKey,
      productIds: [],
    };
  }

  // New ISO week → reset and start immediately (first successful tick of the week)
  if (state.weekKey !== weekKey) {
    state = {
      ...emptyForWeek(weekKey),
      total,
      status: "running",
    };
    writeScheduler(state);
  }

  // Same week but still idle (e.g. reset / empty arm) → start now
  if (state.status === "idle") {
    state = { ...state, status: "running", cursor: 0, total, lastError: null };
    writeScheduler(state);
  }

  if (state.status === "done") {
    return {
      ok: true,
      skipped: true,
      reason: "week_done",
      scanned: 0,
      cursor: state.cursor,
      total,
      status: "done",
      weekKey,
      productIds: [],
    };
  }

  // running: enforce hour gap
  if (state.lastBatchAt) {
    const elapsed = now.getTime() - new Date(state.lastBatchAt).getTime();
    if (elapsed < MIN_BATCH_GAP_MS) {
      return {
        ok: true,
        skipped: true,
        reason: "batch_gap",
        scanned: 0,
        cursor: state.cursor,
        total,
        status: "running",
        weekKey,
        productIds: [],
      };
    }
  }

  const cursor = Math.max(0, state.cursor || 0);
  if (cursor >= total) {
    state = {
      ...state,
      status: "done",
      cursor: total,
      total,
      lastError: null,
    };
    writeScheduler(state);
    return {
      ok: true,
      skipped: true,
      reason: "already_complete",
      scanned: 0,
      cursor: total,
      total,
      status: "done",
      weekKey,
      productIds: [],
    };
  }

  const batch = watchlist.items.slice(cursor, cursor + BATCH_SIZE);
  const productIds = batch.map((i) => i.id);

  try {
    const scanned = await scanProducts(batch.map(watchlistItemToProductRaw), 1);
    const nextCache = mergeCacheResults(readCache(), scanned);
    writeCache(nextCache);

    const nextCursor = cursor + batch.length;
    const done = nextCursor >= total;
    state = {
      weekKey,
      status: done ? "done" : "running",
      cursor: nextCursor,
      total,
      lastBatchAt: now.toISOString(),
      lastError: null,
      lastScannedIds: productIds,
    };
    writeScheduler(state);

    return {
      ok: true,
      scanned: scanned.length,
      cursor: nextCursor,
      total,
      status: state.status,
      weekKey,
      productIds,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    state = {
      ...state,
      weekKey,
      total,
      lastError: message.slice(0, 400),
      lastBatchAt: now.toISOString(),
    };
    writeScheduler(state);
    return {
      ok: false,
      scanned: 0,
      cursor: state.cursor,
      total,
      status: state.status,
      weekKey,
      productIds,
      error: message,
    };
  }
}
