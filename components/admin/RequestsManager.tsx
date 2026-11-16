"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProductRequest, RequestStatus } from "@/lib/requests";

type StatusFilter = "all" | RequestStatus;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-BY", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: RequestStatus): string {
  return status === "draft" ? "Неотправленный" : "Отправленный";
}

export function RequestsManager() {
  const [requests, setRequests] = useState<ProductRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    if (filter === "all") return requests;
    return requests.filter((r) => r.status === filter);
  }, [requests, filter]);

  const counts = useMemo(() => {
    let draft = 0;
    let submitted = 0;
    for (const r of requests) {
      if (r.status === "draft") draft += 1;
      else submitted += 1;
    }
    return { all: requests.length, draft, submitted };
  }, [requests]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/requests", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ProductRequest[] = await res.json();
      setRequests(data);
      setError(null);
    } catch {
      setError("Не удалось загрузить запросы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  async function openRequest(id: string) {
    setSelectedId(id);
    const current = requests.find((r) => r.id === id);
    if (current && !current.seenAt) {
      try {
        const res = await fetch(`/api/admin/requests/${id}/seen`, { method: "POST" });
        if (res.ok) {
          const updated: ProductRequest = await res.json();
          setRequests((prev) => prev.map((r) => (r.id === id ? updated : r)));
        }
      } catch {
        // ignore mark-seen failure
      }
    }
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка запросов…</p>;
  }

  if (error) {
    return (
      <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {error}
      </p>
    );
  }

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "Все", count: counts.all },
    { id: "draft", label: "Неотправленные", count: counts.draft },
    { id: "submitted", label: "Отправленные", count: counts.submitted },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${active ? "text-slate-300" : "text-slate-400"}`}>
                {f.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">
              Запросы ({filtered.length})
            </h2>
          </div>
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-sm text-slate-500">Нет запросов в этом фильтре</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {filtered.map((req) => {
                const isActive = req.id === selectedId;
                const isNew = !req.seenAt;
                const isDraft = req.status === "draft";
                return (
                  <li key={req.id}>
                    <button
                      type="button"
                      onClick={() => openRequest(req.id)}
                      className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-slate-50 ${
                        isActive ? "bg-slate-100" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-slate-900">
                          № {req.number}
                          {req.organization ? ` · ${req.organization}` : ""}
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isDraft ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                              Неотправленный
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">
                              Отправленный
                            </span>
                          )}
                          {isNew && (
                            <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Новый
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        {formatDate(req.updatedAt || req.createdAt)}
                      </p>
                      <p className="truncate text-xs text-slate-600">
                        {req.phone || "—"} · {req.email || "—"} · {req.items.length} поз.
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 className="text-sm font-bold text-slate-900">Детали запроса</h2>
          </div>
          {!selected ? (
            <p className="px-4 py-8 text-sm text-slate-500">
              Выберите запрос слева, чтобы посмотреть детали
            </p>
          ) : (
            <div className="space-y-4 p-4">
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-slate-500">Номер:</span>{" "}
                  <span className="font-medium text-slate-900">№ {selected.number}</span>
                </p>
                <p>
                  <span className="text-slate-500">Статус:</span>{" "}
                  <span className="font-medium text-slate-900">
                    {statusLabel(selected.status)}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Обновлено:</span>{" "}
                  <span className="font-medium text-slate-900">
                    {formatDate(selected.updatedAt || selected.createdAt)}
                  </span>
                </p>
                {selected.submittedAt && (
                  <p>
                    <span className="text-slate-500">Отправлен:</span>{" "}
                    <span className="font-medium text-slate-900">
                      {formatDate(selected.submittedAt)}
                    </span>
                  </p>
                )}
                <p>
                  <span className="text-slate-500">Организация:</span>{" "}
                  <span className="font-medium text-slate-900">
                    {selected.organization || "—"}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Телефон:</span>{" "}
                  {selected.phone ? (
                    <a
                      href={`tel:${selected.phone}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {selected.phone}
                    </a>
                  ) : (
                    <span className="font-medium text-slate-900">—</span>
                  )}
                </p>
                <p>
                  <span className="text-slate-500">Email:</span>{" "}
                  {selected.email ? (
                    <a
                      href={`mailto:${selected.email}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {selected.email}
                    </a>
                  ) : (
                    <span className="font-medium text-slate-900">—</span>
                  )}
                </p>
              </div>

              {selected.items.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  В запросе пока нет позиций
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">SKU</th>
                        <th className="px-3 py-2">Название</th>
                        <th className="px-3 py-2 text-right">Кол-во</th>
                        <th className="px-3 py-2 text-right">Цена</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map((item) => (
                        <tr key={item.sku} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono text-xs text-slate-700">
                            {item.sku}
                          </td>
                          <td className="px-3 py-2 text-slate-900">
                            <a
                              href={`/product/${encodeURIComponent(item.sku)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="hover:underline"
                            >
                              {item.name}
                            </a>
                          </td>
                          <td className="px-3 py-2 text-right font-medium">{item.qty}</td>
                          <td className="px-3 py-2 text-right text-slate-700">
                            {item.price} {item.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
