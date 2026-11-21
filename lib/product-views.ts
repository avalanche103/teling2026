import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

const VIEWS_FILE = path.join(process.cwd(), "data", "product-views.json");
const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_THRESHOLD = 50;

let _views: Record<string, number> | null = null;
let _dirtyIncrements = 0;
let _flushTimer: ReturnType<typeof setTimeout> | null = null;
let _flushing = false;

function loadViews(): Record<string, number> {
  if (_views) return _views;
  try {
    if (!existsSync(VIEWS_FILE)) {
      _views = {};
      return _views;
    }
    const raw = readFileSync(VIEWS_FILE, "utf-8").trim();
    if (!raw) {
      _views = {};
      return _views;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      _views = {};
      return _views;
    }
    const next: Record<string, number> = {};
    for (const [sku, value] of Object.entries(parsed as Record<string, unknown>)) {
      const key = sku.trim();
      const count = typeof value === "number" ? value : Number(value);
      if (!key || !Number.isFinite(count) || count <= 0) continue;
      next[key] = Math.floor(count);
    }
    _views = next;
    return _views;
  } catch {
    _views = {};
    return _views;
  }
}

function scheduleFlush(): void {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => {
    _flushTimer = null;
    void flushProductViews();
  }, FLUSH_INTERVAL_MS);
  // Allow Node to exit even if a timer is pending (dev / short-lived scripts).
  if (typeof _flushTimer === "object" && _flushTimer && "unref" in _flushTimer) {
    _flushTimer.unref();
  }
}

export function getProductViewCount(sku: string): number {
  const key = sku.trim();
  if (!key) return 0;
  return loadViews()[key] ?? 0;
}

export function incrementProductView(sku: string): number {
  const key = sku.trim();
  if (!key) return 0;

  const views = loadViews();
  const next = (views[key] ?? 0) + 1;
  views[key] = next;
  _dirtyIncrements += 1;

  if (_dirtyIncrements >= FLUSH_THRESHOLD) {
    void flushProductViews();
  } else {
    scheduleFlush();
  }

  return next;
}

export async function flushProductViews(): Promise<void> {
  if (_flushing) return;
  if (_dirtyIncrements <= 0) return;

  _flushing = true;
  try {
    const views = loadViews();
    const dir = path.dirname(VIEWS_FILE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(VIEWS_FILE, JSON.stringify(views), "utf-8");
    _dirtyIncrements = 0;
    // Soft refresh: next catalog hit rebuilds section images from latest views.
    // Dynamic import avoids a circular dependency with lib/data.ts.
    const { invalidateSectionCaches } = await import("./data");
    invalidateSectionCaches();
  } finally {
    _flushing = false;
  }
}
