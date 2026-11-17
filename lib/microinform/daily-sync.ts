import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { fetchAndCachePrice } from "./price-cache";
import { MICROINFORM_DIR, SYNC_LOCK_PATH, SYNC_LOG_PATH } from "./paths";
import { readSectionMap, readSettings } from "./store";
import { applyPriceBook, type ApplyResult } from "./sync";

const MAX_LOG_ENTRIES = 60;
const STALE_LOCK_MS = 30 * 60 * 1000;

export interface SyncLogEntry {
  at: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  priceDate?: string | null;
  productCount?: number;
  error?: string;
  result?: Pick<
    ApplyResult,
    "created" | "updated" | "hiddenAbsent" | "pendingNew" | "totalMicroinform" | "createdSections"
  >;
}

export interface DailySyncResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  priceDate?: string | null;
  productCount?: number;
  error?: string;
  result?: ApplyResult;
  log: SyncLogEntry;
}

function ensureDir(): void {
  if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });
}

function readSyncLog(): SyncLogEntry[] {
  ensureDir();
  if (!existsSync(SYNC_LOG_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(SYNC_LOG_PATH, "utf-8")) as SyncLogEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function appendSyncLog(entry: SyncLogEntry): void {
  ensureDir();
  const next = [entry, ...readSyncLog()].slice(0, MAX_LOG_ENTRIES);
  writeFileSync(SYNC_LOG_PATH, JSON.stringify(next, null, 2), "utf-8");
}

export function getLatestSyncLog(): SyncLogEntry | null {
  return readSyncLog()[0] || null;
}

export function readSyncLogEntries(limit = 10): SyncLogEntry[] {
  return readSyncLog().slice(0, Math.max(1, limit));
}

function acquireLock(): boolean {
  ensureDir();
  if (existsSync(SYNC_LOCK_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(SYNC_LOCK_PATH, "utf-8")) as { at?: string; pid?: number };
      const at = raw.at ? Date.parse(raw.at) : NaN;
      if (Number.isFinite(at) && Date.now() - at < STALE_LOCK_MS) {
        return false;
      }
    } catch {
      // Stale/corrupt lock — replace.
    }
  }
  writeFileSync(
    SYNC_LOCK_PATH,
    JSON.stringify({ at: new Date().toISOString(), pid: process.pid }, null, 2),
    "utf-8",
  );
  return true;
}

function releaseLock(): void {
  try {
    if (existsSync(SYNC_LOCK_PATH)) unlinkSync(SYNC_LOCK_PATH);
  } catch {
    // ignore
  }
}

export async function runDailyMicroinformSync(): Promise<DailySyncResult> {
  if (!acquireLock()) {
    const log: SyncLogEntry = {
      at: new Date().toISOString(),
      ok: false,
      skipped: true,
      reason: "busy",
      error: "Синхронизация уже выполняется (sync.lock)",
    };
    appendSyncLog(log);
    return { ok: false, skipped: true, reason: "busy", error: log.error, log };
  }

  try {
    const settings = readSettings();
    const book = await fetchAndCachePrice(settings.priceUrl);
    const sectionMap = readSectionMap();
    const result = applyPriceBook(book, sectionMap);

    const log: SyncLogEntry = {
      at: new Date().toISOString(),
      ok: true,
      priceDate: book.priceDate,
      productCount: book.products.length,
      result: {
        created: result.created,
        updated: result.updated,
        hiddenAbsent: result.hiddenAbsent,
        pendingNew: result.pendingNew,
        totalMicroinform: result.totalMicroinform,
        createdSections: result.createdSections,
      },
    };
    appendSyncLog(log);
    return {
      ok: true,
      priceDate: book.priceDate,
      productCount: book.products.length,
      result,
      log,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка синхронизации";
    const log: SyncLogEntry = {
      at: new Date().toISOString(),
      ok: false,
      error: message,
    };
    appendSyncLog(log);
    return { ok: false, error: message, log };
  } finally {
    releaseLock();
  }
}
