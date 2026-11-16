"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ProductSummary } from "@/lib/types";
import { formatPrice, hasPrice } from "@/lib/format";
import { useRequestCart } from "@/components/request/RequestCartProvider";

interface BySkusResponse {
  items: ProductSummary[];
}

export function RequestPageClient() {
  const { items, ready, requestId, requestNumber, setQty, removeItem, clear } =
    useRequestCart();
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ number: number | null } | null>(null);

  const skusKey = useMemo(() => items.map((i) => i.sku).join("|"), [items]);

  useEffect(() => {
    if (!ready) return;
    if (items.length === 0) {
      setProducts([]);
      return;
    }

    let cancelled = false;
    setLoadingProducts(true);

    const params = new URLSearchParams();
    for (const line of items) params.append("sku", line.sku);

    fetch(`/api/products/by-skus?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as BySkusResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setProducts(data.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProducts([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingProducts(false);
      });

    return () => {
      cancelled = true;
    };
  }, [ready, skusKey, items]);

  const rows = useMemo(() => {
    const bySku = new Map(products.map((p) => [p.sku, p]));
    return items.map((line) => ({
      line,
      product: bySku.get(line.sku) ?? null,
    }));
  }, [items, products]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (items.length === 0) {
      setError("Добавьте хотя бы один товар в запрос");
      return;
    }

    const org = organization.trim();
    const ph = phone.trim();
    const em = email.trim();
    if (!org || !ph || !em) {
      setError("Заполните все обязательные поля");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: requestId,
          organization: org,
          phone: ph,
          email: em,
          items: items.map((line) => ({ sku: line.sku, qty: line.qty })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        id?: string;
        number?: number;
      };
      if (!res.ok) {
        setError(data.error || "Не удалось отправить запрос");
        return;
      }
      const number =
        typeof data.number === "number"
          ? data.number
          : requestNumber;
      clear();
      setOrganization("");
      setPhone("");
      setEmail("");
      setSuccess({ number });
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
        <p className="text-sm text-black/60">Загрузка запроса…</p>
      </main>
    );
  }

  if (success) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
          <h1 className="text-2xl font-black text-emerald-900">
            {success.number != null
              ? `Запрос № ${success.number} отправлен`
              : "Запрос отправлен"}
          </h1>
          <p className="mt-3 text-sm text-emerald-800">
            Мы получили ваш запрос. Наши менеджеры постараются связаться с Вами как можно быстрее.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/catalog"
              className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              В каталог
            </Link>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Новый запрос
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 lg:px-6">
      <h1 className="text-2xl font-black tracking-tight text-black">
        {requestNumber != null ? `Запрос № ${requestNumber}` : "Запрос"}
      </h1>
      <p className="mt-2 text-sm text-black/70">
        Пожалуйста, проверьте позиции, количество, укажите контакты организации и отправьте запрос.
        Наши менеджеры постараются связаться с Вами как можно быстрее.
      </p>

      <section className="mt-8 space-y-3">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-black/70">
            В запросе пока нет товаров.{" "}
            <Link href="/catalog" className="font-semibold text-black underline">
              Перейти в каталог
            </Link>
          </div>
        ) : loadingProducts && products.length === 0 ? (
          <p className="text-sm text-black/60">Загрузка товаров…</p>
        ) : (
          rows.map(({ line, product }) => (
            <div
              key={line.sku}
              className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                {product?.thumbnail ? (
                  <Image
                    src={product.thumbnail}
                    alt={product.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                    Нет фото
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium uppercase tracking-wide text-black/60">
                  Артикул: {line.sku}
                </p>
                <Link
                  href={`/product/${encodeURIComponent(line.sku)}`}
                  className="mt-1 line-clamp-2 text-sm font-semibold text-black hover:underline"
                >
                  {product?.name ?? "Товар недоступен"}
                </Link>
                {product && (
                  <p className="mt-1 text-sm text-black/80">
                    {formatPrice(product.price, product.currency)}
                    {hasPrice(product.price) ? (
                      <span className="ml-1 text-xs text-black/50">с НДС</span>
                    ) : null}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Уменьшить количество"
                  onClick={() => setQty(line.sku, line.qty - 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={line.qty}
                  onChange={(e) => {
                    const next = Math.floor(Number(e.target.value));
                    if (Number.isFinite(next)) setQty(line.sku, next);
                  }}
                  className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-center text-sm outline-none ring-slate-400 focus:ring-2"
                />
                <button
                  type="button"
                  aria-label="Увеличить количество"
                  onClick={() => setQty(line.sku, line.qty + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-lg font-semibold hover:bg-slate-50"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(line.sku)}
                  className="ml-2 rounded-lg px-3 py-2 text-sm text-rose-700 hover:bg-rose-50"
                >
                  Удалить
                </button>
              </div>
            </div>
          ))
        )}
      </section>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-bold text-black">Контактные данные</h2>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-black/80">
            Название организации <span className="text-rose-600">*</span>
          </span>
          <input
            required
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-400 focus:ring-2"
            placeholder="ООО «Пример»"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-black/80">
            Телефон <span className="text-rose-600">*</span>
          </span>
          <input
            required
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-400 focus:ring-2"
            placeholder="+375 (29) 000-00-00"
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-black/80">
            Адрес эл. почты <span className="text-rose-600">*</span>
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none ring-slate-400 focus:ring-2"
            placeholder="name@company.by"
          />
        </label>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || items.length === 0}
          className="h-11 w-full rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-8"
        >
          {submitting ? "Отправка…" : "Отправить"}
        </button>
      </form>
    </main>
  );
}
