"use client";

import Link from "next/link";
import { Search, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import type { ProductSummary } from "@/lib/types";

interface SearchAutocompleteProps {
  placeholder?: string;
  containerClassName?: string;
  inputClassName?: string;
  onNavigate?: () => void;
}

export function SearchAutocomplete({
  placeholder = "Поиск по названию или артикулу…",
  containerClassName = "relative max-w-xl flex-1",
  inputClassName = "w-full rounded-lg border border-slate-200 bg-white px-4 py-2 pr-10 text-sm text-black placeholder-slate-400 outline-none transition-colors focus:border-slate-500",
  onNavigate,
}: SearchAutocompleteProps) {
  const router = useRouter();
  const pathname = usePathname();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const rootRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setActiveIndex(-1);
  }, [pathname]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(query.trim())}&limit=8`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { results: ProductSummary[] };
        setResults(json.results ?? []);
        setOpen(true);
        setActiveIndex(-1);
      } catch {
        if (!controller.signal.aborted) {
          setResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const canSearch = useMemo(() => query.trim().length > 0, [query]);
  const queryForHighlight = query.trim();

  const navigateToCatalogResults = () => {
    const q = query.trim();
    if (!q) return;
    router.push(`/catalog?q=${encodeURIComponent(q)}`);
    setOpen(false);
    onNavigate?.();
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && activeIndex < results.length) {
      const sku = results[activeIndex].sku;
      router.push(`/product/${encodeURIComponent(sku)}`);
      setOpen(false);
      onNavigate?.();
      return;
    }
    navigateToCatalogResults();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!results.length) return;
      setActiveIndex((prev) => (prev + 1) % results.length);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <form ref={rootRef} onSubmit={handleSubmit} className={containerClassName}>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => {
          if (query.trim()) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={inputClassName}
      />

      <button
        type="submit"
        disabled={!canSearch}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-black disabled:opacity-40"
        aria-label="Поиск"
      >
        <Search className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-50 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-black/80">
              <Loader2 className="h-4 w-4 animate-spin" />
              Поиск…
            </div>
          ) : results.length > 0 ? (
            <ul className="max-h-80 overflow-auto py-1">
              {results.map((product, idx) => (
                <li key={product.sku}>
                  <Link
                    href={`/product/${encodeURIComponent(product.sku)}`}
                    onClick={() => {
                      setOpen(false);
                      onNavigate?.();
                    }}
                    className={`block px-4 py-2.5 transition ${
                      idx === activeIndex ? "bg-slate-100" : "hover:bg-slate-100"
                    }`}
                  >
                    <p className="line-clamp-1 text-sm font-semibold text-black">
                      {renderHighlightedText(product.name, queryForHighlight)}
                    </p>
                    <p className="mt-0.5 text-xs text-black/80">
                      {renderHighlightedText(product.sku, queryForHighlight)} • {product.sectionName}
                    </p>
                  </Link>
                </li>
              ))}
              <li className="border-t border-slate-100">
                <button
                  type="button"
                  onClick={navigateToCatalogResults}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-black hover:bg-slate-100"
                >
                  Показать все результаты «{query.trim()}»
                </button>
              </li>
            </ul>
          ) : (
            <div className="px-4 py-3 text-sm text-black/80">
              Ничего не найдено.
            </div>
          )}
        </div>
      )}
    </form>
  );
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
