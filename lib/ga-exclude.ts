const GA_EXCLUDED_PREFIXES = ["/admin", "/operator", "/login"] as const;

const FILTER_MARK = Symbol.for("teling.gaPathFilter");

type PushFn = (this: unknown, ...args: never[]) => number;

type FilterState = {
  gtagPush: PushFn | null;
  applying: boolean;
};

type FilteredDataLayer = unknown[] & {
  [FILTER_MARK]?: FilterState;
};

export function isGaExcludedPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const path = pathname.split("?")[0]?.split("#")[0] || "/";
  return GA_EXCLUDED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Drops GA hits while the tab is on an internal page.
 *
 * gtag.js replaces `dataLayer.push` after load. The accessor keeps our check
 * in front of that replacement, including enhanced-measurement page views
 * fired on client-side navigations from the public site.
 */
export function installGaPathFilter(): void {
  if (typeof window === "undefined") return;

  const w = window as Window & { dataLayer?: FilteredDataLayer };
  const layer: FilteredDataLayer = (w.dataLayer ??= []);
  if (layer[FILTER_MARK]) return;

  const nativePush = Array.prototype.push as unknown as PushFn;
  const state: FilterState = { gtagPush: null, applying: false };
  layer[FILTER_MARK] = state;

  function filteredPush(this: unknown): number {
    const args = arguments as unknown as never[];
    const current = Array.isArray(this) ? (this as FilteredDataLayer) : layer;
    if (state.applying) return nativePush.apply(current, args);
    if (isGaExcludedPath(window.location.pathname)) return current.length;
    const target = state.gtagPush;
    if (!target) return nativePush.apply(current, args);
    state.applying = true;
    try {
      return target.apply(current, args);
    } finally {
      state.applying = false;
    }
  }

  Object.defineProperty(layer, "push", {
    configurable: true,
    enumerable: false,
    get: () => filteredPush,
    set: (next: unknown) => {
      if (typeof next === "function" && next !== filteredPush) {
        state.gtagPush = next as PushFn;
      }
    },
  });
}

/** Turn collection on or off for the current URL before gtag can send. */
export function syncGaCollection(gaId: string): void {
  if (typeof window === "undefined") return;
  installGaPathFilter();

  const excluded = isGaExcludedPath(window.location.pathname);
  (window as unknown as Record<string, boolean>)[`ga-disable-${gaId}`] = excluded;

  if (!excluded) return;

  // Config commands queued on the previous page would be sent with the
  // admin URL if gtag.js has not started yet. Drop that queue.
  const w = window as Window & { dataLayer?: unknown[]; google_tag_manager?: unknown };
  if (!w.google_tag_manager && Array.isArray(w.dataLayer)) {
    w.dataLayer.length = 0;
  }
}
