"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { formatPrice, formatPriceValue } from "@/lib/format";
import { splitVat } from "@/lib/microinform/pricing";
import type {
  PriceAnalysisProductResult,
  PriceAnalysisSchedulerStatus,
  SerpHit,
} from "@/lib/price-analysis/types";
import type { ProductSummary } from "@/lib/types";

const LAST_VISIT_KEY = "teling.priceAnalysis.lastVisitAt";

interface WatchlistItem {
  id: number;
  sku: string;
  name: string;
  supplier: string | null;
  price: number;
  priceWithoutVat: number;
  costPrice: number | null;
  brand: string;
  sectionName: string;
}

interface SchedulerStatus {
  weekKey: string;
  status: PriceAnalysisSchedulerStatus;
  cursor: number;
  total: number;
  lastBatchAt: string | null;
  lastError: string | null;
  batchSize: number;
  currentWeekKey: string;
}

interface DraftMap {
  [productId: number]: string;
}

function schedulerStatusLabel(status: PriceAnalysisSchedulerStatus): string {
  if (status === "running") return "идёт";
  if (status === "done") return "готово";
  return "ожидание";
}

function engineLabel(engine: string): string {
  return engine === "yandex" ? "Яндекс" : engine === "google" ? "Google" : engine;
}

/** SERP min; legacy rows (pre-Onliner) stored it only as suggestedPrice. */
function serpMinOf(row: PriceAnalysisProductResult | undefined): number | null {
  if (!row) return null;
  if (row.serpMinPrice != null) return row.serpMinPrice;
  if (row.onlinerMinPrice == null && !row.onlinerUrl && row.suggestedPrice != null) {
    return row.suggestedPrice;
  }
  return null;
}

function OnlinerPriceCell({ row }: { row: PriceAnalysisProductResult | undefined }) {
  if (!row || row.onlinerMinPrice == null) {
    return <span className="text-slate-400">—</span>;
  }
  const label = formatPriceValue(row.onlinerMinPrice);
  if (row.onlinerUrl) {
    return (
      <a
        href={row.onlinerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="tabular-nums text-sky-700 hover:underline"
        title={row.onlinerMatchedName || "Onliner"}
      >
        {label}
        {row.onlinerOffers != null ? (
          <span className="ml-1 text-[10px] font-normal text-slate-500">
            ({row.onlinerOffers})
          </span>
        ) : null}
      </a>
    );
  }
  return <span className="tabular-nums">{label}</span>;
}

function renderHighlightedText(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${safe})`, "ig");
  const parts = text.split(regex);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.toLowerCase() === q.toLowerCase()) {
      return (
        <mark key={`${part}-${index}`} className="rounded bg-slate-200 px-0.5 text-black">
          {part}
        </mark>
      );
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

export function PriceAnalysisPanel() {
  const [watchItems, setWatchItems] = useState<WatchlistItem[]>([]);
  const [results, setResults] = useState<PriceAnalysisProductResult[]>([]);
  const [configured, setConfigured] = useState(true);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState<string | null>(null);
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [lastVisitAt, setLastVisitAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [selected, setSelected] = useState<Record<number, boolean>>({});

  const [searchQ, setSearchQ] = useState("");
  const [suggestions, setSuggestions] = useState<ProductSummary[]>([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [activeSuggest, setActiveSuggest] = useState(-1);
  const searchRootRef = useRef<HTMLDivElement>(null);
  const visitSavedRef = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [wRes, rRes] = await Promise.all([
        fetch("/api/admin/price-analysis/watchlist", { cache: "no-store" }),
        fetch("/api/admin/price-analysis/results", { cache: "no-store" }),
      ]);
      if (!wRes.ok) throw new Error("Не удалось загрузить watchlist");
      if (!rRes.ok) throw new Error("Не удалось загрузить результаты");
      const wJson = (await wRes.json()) as { items: WatchlistItem[] };
      const rJson = (await rRes.json()) as {
        configured: boolean;
        updatedAt: string | null;
        results: PriceAnalysisProductResult[];
        scheduler?: SchedulerStatus;
      };
      setWatchItems(wJson.items || []);
      setResults(rJson.results || []);
      setConfigured(Boolean(rJson.configured));
      setCacheUpdatedAt(rJson.updatedAt);
      setScheduler(rJson.scheduler ?? null);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const row of rJson.results || []) {
          if (next[row.productId] === undefined && row.suggestedPrice != null) {
            next[row.productId] = String(row.suggestedPrice);
          }
        }
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setLastVisitAt(window.localStorage.getItem(LAST_VISIT_KEY));
    } catch {
      setLastVisitAt(null);
    }
    void load();
  }, [load]);

  const markVisit = useCallback(() => {
    const now = new Date().toISOString();
    try {
      window.localStorage.setItem(LAST_VISIT_KEY, now);
    } catch {
      /* ignore quota / private mode */
    }
    visitSavedRef.current = true;
  }, []);

  useEffect(() => {
    if (loading) return;
    // Persist visit after first paint so highlight uses the previous value this session.
    const t = window.setTimeout(() => markVisit(), 800);
    const onHide = () => markVisit();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onHide);
      if (!visitSavedRef.current) markVisit();
    };
  }, [loading, markVisit]);

  const isUpdatedSinceVisit = useCallback(
    (scannedAt: string | undefined) => {
      if (!scannedAt || !lastVisitAt) return false;
      return new Date(scannedAt).getTime() > new Date(lastVisitAt).getTime();
    },
    [lastVisitAt],
  );

  const resultById = useMemo(() => {
    const map = new Map<number, PriceAnalysisProductResult>();
    for (const r of results) map.set(r.productId, r);
    return map;
  }, [results]);

  const watchIdSet = useMemo(() => new Set(watchItems.map((i) => i.id)), [watchItems]);

  const saveWatchlist = async (ids: number[]) => {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/admin/price-analysis/watchlist", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: ids }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || "Не удалось сохранить список");
    }
    await load();
  };

  const addToWatchlist = async (product: {
    id: number;
    sku: string;
    name: string;
    price: number;
    brand?: string;
    sectionName?: string;
  }) => {
    try {
      if (watchIdSet.has(product.id)) {
        setMessage("Товар уже в списке");
        return;
      }
      setError(null);
      setMessage(null);
      const res = await fetch("/api/admin/price-analysis/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          add: {
            id: product.id,
            sku: product.sku,
            name: product.name,
            price: product.price,
            brand: product.brand,
            sectionName: product.sectionName,
          },
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        error?: string;
        already?: boolean;
      };
      if (!res.ok) throw new Error(body.error || "Не удалось добавить товар");
      await load();
      setMessage(
        body.already
          ? "Товар уже в списке"
          : "Товар добавлен (себестоимость подтянута из прайса, если есть)",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const selectedIds = useMemo(
    () => watchItems.filter((i) => selected[i.id]).map((i) => i.id),
    [watchItems, selected],
  );

  const queryForHighlight = searchQ.trim();

  const removeFromWatchlist = async (id: number) => {
    setRemovingId(id);
    setError(null);
    setMessage(null);
    try {
      await saveWatchlist(watchItems.map((i) => i.id).filter((x) => x !== id));
      setSelected((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      setResults((prev) => prev.filter((r) => r.productId !== id));
      setMessage("Товар удалён из списка");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemovingId(null);
    }
  };

  const removeSelected = async () => {
    if (!selectedIds.length) return;
    setError(null);
    setMessage(null);
    try {
      const removeSet = new Set(selectedIds);
      await saveWatchlist(watchItems.map((i) => i.id).filter((id) => !removeSet.has(id)));
      setSelected({});
      setResults((prev) => prev.filter((r) => !removeSet.has(r.productId)));
      setMessage(`Удалено из списка: ${selectedIds.length}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    const q = searchQ.trim();
    if (!q) {
      setSuggestions([]);
      setSuggestLoading(false);
      setActiveSuggest(-1);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setSuggestLoading(true);
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q)}&limit=8`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { results: ProductSummary[] };
        setSuggestions(json.results ?? []);
        setSuggestOpen(true);
        setActiveSuggest(-1);
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSuggestLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [searchQ]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!searchRootRef.current?.contains(e.target as Node)) {
        setSuggestOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const pickSuggestion = async (product: ProductSummary) => {
    setSuggestOpen(false);
    setSearchQ("");
    setSuggestions([]);
    await addToWatchlist({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: product.price,
      brand: product.brand,
      sectionName: product.sectionName,
    });
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!suggestOpen && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setSuggestOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!suggestions.length) return;
      setActiveSuggest((prev) => (prev + 1) % suggestions.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!suggestions.length) return;
      setActiveSuggest((prev) => (prev <= 0 ? suggestions.length - 1 : prev - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeSuggest >= 0 && activeSuggest < suggestions.length) {
        void pickSuggestion(suggestions[activeSuggest]);
      } else if (suggestions.length === 1) {
        void pickSuggestion(suggestions[0]);
      }
      return;
    }
    if (e.key === "Escape") {
      setSuggestOpen(false);
      setActiveSuggest(-1);
    }
  };

  const runScan = async (onlySelected: boolean) => {
    setScanning(true);
    setError(null);
    setMessage(null);
    try {
      const body =
        onlySelected && selectedIds.length
          ? { productIds: selectedIds }
          : {};
      const res = await fetch("/api/admin/price-analysis/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        scanned?: number;
        results?: PriceAnalysisProductResult[];
        updatedAt?: string;
      };
      if (!res.ok) throw new Error(json.error || "Скан не удался");

      if (json.results) {
        setResults((prev) => {
          const map = new Map(prev.map((r) => [r.productId, r]));
          for (const row of json.results!) map.set(row.productId, row);
          return [...map.values()];
        });
        setDrafts((prev) => {
          const next = { ...prev };
          for (const row of json.results!) {
            if (row.suggestedPrice != null) next[row.productId] = String(row.suggestedPrice);
          }
          return next;
        });
      }
      if (json.updatedAt) setCacheUpdatedAt(json.updatedAt);
      setMessage(`Сканировано: ${json.scanned ?? 0} (Яндекс+Google ≈ ${(json.scanned ?? 0) * 2} запросов XMLRiver)`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const savePrice = async (item: WatchlistItem) => {
    const raw = (drafts[item.id] ?? "").replace(",", ".").trim();
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      setError("Введите корректную цену");
      return;
    }
    setSavingId(item.id);
    setError(null);
    setMessage(null);
    try {
      const { priceWithoutVat, vatAmount } = splitVat(price);
      const res = await fetch(`/api/admin/products/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          price,
          price_without_vat: priceWithoutVat,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || "Не удалось сохранить цену");
      }
      void vatAmount;
      await fetch("/api/admin/price-analysis/watchlist", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patch: { id: item.id, price, priceWithoutVat },
        }),
      }).catch(() => {});
      setWatchItems((prev) =>
        prev.map((w) =>
          w.id === item.id ? { ...w, price, priceWithoutVat } : w,
        ),
      );
      setMessage(`Цена сохранена: ${formatPrice(price)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          XMLRiver не настроен. Добавьте <code className="font-mono">XMLRIVER_USER</code> и{" "}
          <code className="font-mono">XMLRIVER_KEY</code> в окружение сервера.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      {scheduler && (
        <section className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Автоскан (неделя)</h2>
          <p className="mt-1 text-xs text-slate-600">
            Неделя {scheduler.weekKey || scheduler.currentWeekKey || "—"} · статус{" "}
            <span className="font-medium text-slate-800">
              {schedulerStatusLabel(scheduler.status)}
            </span>
            {" · "}
            прогресс {Math.min(scheduler.cursor, scheduler.total)}/
            {scheduler.total || watchItems.length}
            {scheduler.batchSize ? ` (по ${scheduler.batchSize})` : ""}
            {scheduler.lastBatchAt
              ? ` · последняя партия ${new Date(scheduler.lastBatchAt).toLocaleString("ru-RU")}`
              : ""}
          </p>
          {scheduler.lastError && (
            <p className="mt-1 text-xs text-amber-700">Ошибка: {scheduler.lastError}</p>
          )}
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Добавить в мониторинг</h2>
        <p className="mt-1 text-xs text-slate-500">
          Поиск как на сайте — выберите подсказку: себестоимость подтянется при добавлении (без
          загрузки всего каталога). Скан: 2 запроса XMLRiver на товар.
        </p>
        <div ref={searchRootRef} className="relative mt-3 max-w-xl">
          <input
            type="search"
            className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-slate-500"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onFocus={() => {
              if (searchQ.trim()) setSuggestOpen(true);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder="Поиск по названию или артикулу…"
            autoComplete="off"
          />
          {suggestOpen && searchQ.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              {suggestLoading ? (
                <div className="px-4 py-3 text-sm text-slate-600">Поиск…</div>
              ) : suggestions.length > 0 ? (
                <ul className="max-h-80 overflow-auto py-1">
                  {suggestions.map((product, idx) => {
                    const inList = watchIdSet.has(product.id);
                    return (
                      <li key={product.sku}>
                        <button
                          type="button"
                          disabled={inList}
                          onClick={() => void pickSuggestion(product)}
                          className={`flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition disabled:opacity-50 ${
                            idx === activeSuggest ? "bg-slate-100" : "hover:bg-slate-100"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="line-clamp-1 block text-sm font-semibold text-slate-900">
                              {renderHighlightedText(product.name, queryForHighlight)}
                            </span>
                            <span className="mt-0.5 block text-xs text-slate-600">
                              {renderHighlightedText(product.sku, queryForHighlight)}
                              {product.sectionName ? ` • ${product.sectionName}` : ""}
                              {" · "}
                              {formatPrice(product.price)}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-slate-500">
                            {inList ? "В списке" : "Добавить"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-4 py-3 text-sm text-slate-600">Ничего не найдено.</div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Мониторинг ({watchItems.length})
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {cacheUpdatedAt
                ? `Последний скан: ${new Date(cacheUpdatedAt).toLocaleString("ru-RU")}`
                : "Сканов ещё не было"}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
            <button
              type="button"
              disabled={scanning || !watchItems.length || !configured}
              onClick={() => void runScan(false)}
              className="w-full rounded-md bg-sky-700 px-3 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50 sm:w-auto"
            >
              {scanning ? "Сканирование…" : "Сканировать все"}
            </button>
            <button
              type="button"
              disabled={scanning || !selectedIds.length || !configured}
              onClick={() => void runScan(true)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 sm:w-auto"
            >
              Сканировать выбранные ({selectedIds.length})
            </button>
            <button
              type="button"
              disabled={!selectedIds.length || removingId != null}
              onClick={() => void removeSelected()}
              className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 sm:w-auto"
            >
              Удалить выбранные ({selectedIds.length})
            </button>
          </div>
        </div>

        {watchItems.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Список пуст — добавьте товары выше.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {watchItems.map((item) => {
                const row = resultById.get(item.id);
                const cost = item.costPrice ?? row?.costPrice ?? null;
                const serpMin = serpMinOf(row);
                const draft =
                  drafts[item.id] ??
                  (row?.suggestedPrice != null ? String(row.suggestedPrice) : "");
                const draftNum = Number(String(draft).replace(",", "."));
                const belowCost =
                  cost != null &&
                  Number.isFinite(draftNum) &&
                  draftNum > 0 &&
                  draftNum < cost;
                const noSnippets =
                  row &&
                  !row.error &&
                  row.validPrices.length === 0 &&
                  row.hits.length > 0;
                const isOpen = Boolean(expanded[item.id]);
                const updated = isUpdatedSinceVisit(row?.scannedAt);

                return (
                  <article
                    key={item.id}
                    className={`rounded-xl border p-3 ${
                      updated
                        ? "border-sky-200 bg-sky-50/80"
                        : "border-slate-200 bg-slate-50/50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(selected[item.id])}
                        onChange={(e) =>
                          setSelected((prev) => ({ ...prev, [item.id]: e.target.checked }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{item.name}</p>
                          {updated && (
                            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Обновлено
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">
                          {item.sku}
                          {item.supplier ? ` · ${item.supplier}` : ""}
                        </p>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-slate-500">Себестоимость</dt>
                        <dd className="tabular-nums text-slate-800">
                          {cost != null ? formatPriceValue(cost) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Наша цена</dt>
                        <dd className="tabular-nums text-slate-900">
                          {formatPriceValue(item.price)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Onliner</dt>
                        <dd>
                          <OnlinerPriceCell row={row} />
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Min сниппет</dt>
                        <dd className="tabular-nums">
                          {serpMin != null ? formatPriceValue(serpMin) : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Находки</dt>
                        <dd>
                          {row ? (
                            <button
                              type="button"
                              className="text-xs font-medium text-sky-700 hover:underline"
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [item.id]: !prev[item.id],
                                }))
                              }
                            >
                              {row.validPrices.length}/{row.hits.length}{" "}
                              {isOpen ? "▲" : "▼"}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">нет скана</span>
                          )}
                        </dd>
                      </div>
                    </dl>
                    {row?.error && (
                      <p className="mt-2 text-xs text-amber-700">{row.error}</p>
                    )}
                    {noSnippets && (
                      <p className="mt-2 text-xs text-amber-700">
                        В сниппетах цен не найдено (или отфильтрованы как мусор)
                      </p>
                    )}
                    <label className="mt-3 block text-xs text-slate-600">
                      Предложенная цена
                      <input
                        className={`mt-1 w-full rounded-md border px-3 py-2 text-sm tabular-nums ${
                          belowCost ? "border-amber-400 bg-amber-50" : "border-slate-300"
                        }`}
                        value={draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        placeholder="цена"
                      />
                    </label>
                    {belowCost && (
                      <p className="mt-1 text-[11px] text-amber-700">Ниже себестоимости</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={savingId === item.id || !draft.trim()}
                        onClick={() => void savePrice(item)}
                        className="rounded-md bg-slate-900 px-2.5 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                      >
                        {savingId === item.id ? "…" : "Сохранить"}
                      </button>
                      <button
                        type="button"
                        disabled={removingId === item.id}
                        onClick={() => void removeFromWatchlist(item.id)}
                        className="rounded-md border border-red-200 px-2.5 py-2 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {removingId === item.id ? "…" : "Удалить"}
                      </button>
                    </div>
                    {isOpen && row && (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <SnippetsList hits={row.hits} query={row.query} />
                      </div>
                    )}
                  </article>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-2 py-2">
                      <span className="sr-only">Выбор</span>
                    </th>
                    <th className="px-2 py-2">Товар</th>
                    <th className="px-2 py-2">Себестоимость</th>
                    <th className="px-2 py-2">Наша цена</th>
                    <th className="px-2 py-2">Onliner</th>
                    <th className="px-2 py-2">Min сниппет</th>
                    <th className="px-2 py-2">Находки</th>
                    <th className="px-2 py-2">Предложенная</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {watchItems.map((item) => {
                    const row = resultById.get(item.id);
                    const cost = item.costPrice ?? row?.costPrice ?? null;
                    const ourPrice = item.price;
                    const serpMin = serpMinOf(row);
                    const draft =
                      drafts[item.id] ??
                      (row?.suggestedPrice != null ? String(row.suggestedPrice) : "");
                    const draftNum = Number(String(draft).replace(",", "."));
                    const belowCost =
                      cost != null &&
                      Number.isFinite(draftNum) &&
                      draftNum > 0 &&
                      draftNum < cost;
                    const noSnippets =
                      row &&
                      !row.error &&
                      row.validPrices.length === 0 &&
                      row.hits.length > 0;
                    const isOpen = Boolean(expanded[item.id]);
                    const updated = isUpdatedSinceVisit(row?.scannedAt);

                    return (
                      <Fragment key={item.id}>
                        <tr className={`align-top ${updated ? "bg-sky-50/90" : ""}`}>
                          <td className="px-2 py-3">
                            <input
                              type="checkbox"
                              checked={Boolean(selected[item.id])}
                              onChange={(e) =>
                                setSelected((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.checked,
                                }))
                              }
                            />
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex max-w-[280px] flex-wrap items-center gap-2 font-medium text-slate-900">
                              <span>{item.name}</span>
                              {updated && (
                                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                                  Обновлено
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {item.sku}
                              {item.supplier ? ` · ${item.supplier}` : ""}
                            </div>
                            {row?.error && (
                              <div className="mt-1 text-xs text-amber-700">{row.error}</div>
                            )}
                            {noSnippets && (
                              <div className="mt-1 text-xs text-amber-700">
                                В сниппетах цен не найдено (или отфильтрованы как мусор)
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3 tabular-nums text-slate-700">
                            {cost != null ? formatPriceValue(cost) : "—"}
                          </td>
                          <td className="px-2 py-3 tabular-nums text-slate-900">
                            {formatPriceValue(ourPrice)}
                          </td>
                          <td className="px-2 py-3">
                            <OnlinerPriceCell row={row} />
                          </td>
                          <td className="px-2 py-3 tabular-nums">
                            {serpMin != null ? formatPriceValue(serpMin) : "—"}
                          </td>
                          <td className="px-2 py-3">
                            {row ? (
                              <button
                                type="button"
                                className="text-xs font-medium text-sky-700 hover:underline"
                                onClick={() =>
                                  setExpanded((prev) => ({
                                    ...prev,
                                    [item.id]: !prev[item.id],
                                  }))
                                }
                              >
                                {row.validPrices.length}/{row.hits.length}{" "}
                                {isOpen ? "▲" : "▼"}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">нет скана</span>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <input
                              className={`w-28 rounded-md border px-2 py-1.5 text-sm tabular-nums ${
                                belowCost
                                  ? "border-amber-400 bg-amber-50"
                                  : "border-slate-300"
                              }`}
                              value={draft}
                              onChange={(e) =>
                                setDrafts((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder="цена"
                            />
                            {belowCost && (
                              <div className="mt-1 text-[11px] text-amber-700">
                                Ниже себестоимости
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-3">
                            <div className="flex flex-col gap-1.5">
                              <button
                                type="button"
                                disabled={savingId === item.id || !draft.trim()}
                                onClick={() => void savePrice(item)}
                                className="rounded-md bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                              >
                                {savingId === item.id ? "…" : "Сохранить"}
                              </button>
                              <button
                                type="button"
                                disabled={removingId === item.id}
                                onClick={() => void removeFromWatchlist(item.id)}
                                className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                {removingId === item.id ? "…" : "Удалить"}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isOpen && row && (
                          <tr>
                            <td colSpan={9} className="bg-slate-50 px-4 py-3">
                              <SnippetsList hits={row.hits} query={row.query} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function SnippetsList({ hits, query }: { hits: SerpHit[]; query: string }) {
  if (!hits.length) {
    return <p className="text-xs text-slate-500">Пустая выдача по запросу «{query}»</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Запрос: {query}</p>
      <ul className="space-y-2">
        {hits.map((hit, idx) => (
          <li key={`${hit.engine}-${hit.url}-${idx}`} className="rounded-md border border-slate-200 bg-white px-3 py-2">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                {engineLabel(hit.engine)}
              </span>
              {hit.url ? (
                <a
                  href={hit.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-sky-800 hover:underline"
                >
                  {hit.title}
                </a>
              ) : (
                <span className="text-sm font-medium">{hit.title}</span>
              )}
              {hit.prices.length > 0 && (
                <span className="text-xs tabular-nums text-slate-600">
                  цены: {hit.prices.map((p) => formatPriceValue(p)).join(", ")}
                </span>
              )}
            </div>
            {hit.snippet && (
              <p className="mt-1 text-xs leading-relaxed text-slate-600">{hit.snippet}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
