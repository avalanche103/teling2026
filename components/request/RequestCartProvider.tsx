"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "teling-request-cart";
const SYNC_DEBOUNCE_MS = 400;

export interface RequestCartLine {
  sku: string;
  qty: number;
}

interface StoredCart {
  requestId: string | null;
  number: number | null;
  items: RequestCartLine[];
}

interface RequestCartContextValue {
  items: RequestCartLine[];
  ready: boolean;
  requestId: string | null;
  requestNumber: number | null;
  totalQty: number;
  lineCount: number;
  addItem: (sku: string, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  removeItem: (sku: string) => void;
  clear: () => void;
  getQty: (sku: string) => number;
}

const RequestCartContext = createContext<RequestCartContextValue | null>(null);

function normalizeItems(raw: unknown): RequestCartLine[] {
  if (!Array.isArray(raw)) return [];
  const map = new Map<string, number>();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const sku = String((entry as { sku?: unknown }).sku ?? "").trim();
    const qty = Math.floor(Number((entry as { qty?: unknown }).qty));
    if (!sku || !Number.isFinite(qty) || qty < 1) continue;
    map.set(sku, (map.get(sku) ?? 0) + qty);
  }
  return Array.from(map.entries()).map(([sku, qty]) => ({ sku, qty }));
}

function readStorage(): StoredCart {
  if (typeof window === "undefined") {
    return { requestId: null, number: null, items: [] };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { requestId: null, number: null, items: [] };
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return { requestId: null, number: null, items: normalizeItems(parsed) };
    }

    if (parsed && typeof parsed === "object") {
      const obj = parsed as {
        requestId?: unknown;
        number?: unknown;
        items?: unknown;
      };
      return {
        requestId:
          typeof obj.requestId === "string" && obj.requestId.trim()
            ? obj.requestId.trim()
            : null,
        number:
          typeof obj.number === "number" && Number.isFinite(obj.number)
            ? obj.number
            : null,
        items: normalizeItems(obj.items),
      };
    }
  } catch {
    // ignore
  }
  return { requestId: null, number: null, items: [] };
}

function writeStorage(cart: StoredCart): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

export function RequestCartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<RequestCartLine[]>([]);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [requestNumber, setRequestNumber] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  const requestIdRef = useRef<string | null>(null);
  const requestNumberRef = useRef<number | null>(null);
  const syncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncGenerationRef = useRef(0);

  useEffect(() => {
    const stored = readStorage();
    setItems(stored.items);
    setRequestId(stored.requestId);
    setRequestNumber(stored.number);
    requestIdRef.current = stored.requestId;
    requestNumberRef.current = stored.number;
    setReady(true);
  }, []);

  const persistAll = useCallback(
    (nextItems: RequestCartLine[], nextId: string | null, nextNumber: number | null) => {
      setItems(nextItems);
      setRequestId(nextId);
      setRequestNumber(nextNumber);
      requestIdRef.current = nextId;
      requestNumberRef.current = nextNumber;
      writeStorage({
        requestId: nextId,
        number: nextNumber,
        items: nextItems,
      });
    },
    []
  );

  const syncDraft = useCallback(async (nextItems: RequestCartLine[]) => {
    const generation = ++syncGenerationRef.current;
    try {
      const res = await fetch("/api/requests/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestIdRef.current,
          items: nextItems,
        }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        id?: string;
        number?: number;
      };
      if (generation !== syncGenerationRef.current) return;
      if (typeof data.id === "string" && typeof data.number === "number") {
        setRequestId(data.id);
        setRequestNumber(data.number);
        requestIdRef.current = data.id;
        requestNumberRef.current = data.number;
        writeStorage({
          requestId: data.id,
          number: data.number,
          items: nextItems,
        });
      }
    } catch {
      // keep local cart; next change will retry
    }
  }, []);

  const scheduleSync = useCallback(
    (nextItems: RequestCartLine[]) => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
      if (nextItems.length === 0 && !requestIdRef.current) return;
      // First create: sync immediately so the number appears right away.
      if (!requestIdRef.current && nextItems.length > 0) {
        void syncDraft(nextItems);
        return;
      }
      syncTimerRef.current = setTimeout(() => {
        void syncDraft(nextItems);
      }, SYNC_DEBOUNCE_MS);
    },
    [syncDraft]
  );

  useEffect(() => {
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    scheduleSync(items);
  }, [items, ready, scheduleSync]);

  const updateItems = useCallback((updater: (prev: RequestCartLine[]) => RequestCartLine[]) => {
    setItems((prev) => {
      const next = updater(prev);
      writeStorage({
        requestId: requestIdRef.current,
        number: requestNumberRef.current,
        items: next,
      });
      return next;
    });
  }, []);

  const addItem = useCallback(
    (sku: string, qty = 1) => {
      const normalizedSku = sku.trim();
      const addQty = Math.floor(qty);
      if (!normalizedSku || !Number.isFinite(addQty) || addQty < 1) return;
      updateItems((prev) => {
        const next = [...prev];
        const idx = next.findIndex((line) => line.sku === normalizedSku);
        if (idx === -1) {
          next.push({ sku: normalizedSku, qty: addQty });
        } else {
          next[idx] = { ...next[idx], qty: next[idx].qty + addQty };
        }
        return next;
      });
    },
    [updateItems]
  );

  const setQty = useCallback(
    (sku: string, qty: number) => {
      const normalizedSku = sku.trim();
      const nextQty = Math.floor(qty);
      if (!normalizedSku) return;
      updateItems((prev) => {
        if (!Number.isFinite(nextQty) || nextQty < 1) {
          return prev.filter((line) => line.sku !== normalizedSku);
        }
        const exists = prev.some((line) => line.sku === normalizedSku);
        return exists
          ? prev.map((line) =>
              line.sku === normalizedSku ? { ...line, qty: nextQty } : line
            )
          : [...prev, { sku: normalizedSku, qty: nextQty }];
      });
    },
    [updateItems]
  );

  const removeItem = useCallback(
    (sku: string) => {
      const normalizedSku = sku.trim();
      updateItems((prev) => prev.filter((line) => line.sku !== normalizedSku));
    },
    [updateItems]
  );

  const clear = useCallback(() => {
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncGenerationRef.current += 1;
    persistAll([], null, null);
  }, [persistAll]);

  const getQty = useCallback(
    (sku: string) => items.find((line) => line.sku === sku)?.qty ?? 0,
    [items]
  );

  const value = useMemo<RequestCartContextValue>(
    () => ({
      items,
      ready,
      requestId,
      requestNumber,
      totalQty: items.reduce((sum, line) => sum + line.qty, 0),
      lineCount: items.length,
      addItem,
      setQty,
      removeItem,
      clear,
      getQty,
    }),
    [
      items,
      ready,
      requestId,
      requestNumber,
      addItem,
      setQty,
      removeItem,
      clear,
      getQty,
    ]
  );

  return (
    <RequestCartContext.Provider value={value}>
      {children}
    </RequestCartContext.Provider>
  );
}

export function useRequestCart(): RequestCartContextValue {
  const ctx = useContext(RequestCartContext);
  if (!ctx) {
    throw new Error("useRequestCart must be used within RequestCartProvider");
  }
  return ctx;
}
