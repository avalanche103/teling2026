"use client";

import { useMemo, useState } from "react";
import type {
  ProductImportApplyRequest,
  ProductImportConflictAction,
  ProductImportMissingAction,
  ProductImportPreview,
} from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { ImportHistory } from "./ImportHistory";

export function ProductsImportManager() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ProductImportPreview | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newSelections, setNewSelections] = useState<Record<string, boolean>>({});
  const [conflictActions, setConflictActions] = useState<Record<string, ProductImportConflictAction>>({});
  const [missingActions, setMissingActions] = useState<Record<string, ProductImportMissingAction>>({});

  const selectedNewCount = useMemo(
    () => Object.values(newSelections).filter(Boolean).length,
    [newSelections],
  );

  const analyzeImport = async () => {
    if (!file) {
      setError("Выберите JSON-файл для импорта");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setSuccess(null);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const res = await fetch("/api/admin/products/import/analyze", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось проанализировать импорт");
        return;
      }

      const nextPreview = json as ProductImportPreview;
      setPreview(nextPreview);
      setNewSelections(
        Object.fromEntries(nextPreview.newProducts.map((item) => [item.importKey, true])),
      );
      setConflictActions(
        Object.fromEntries(nextPreview.conflicts.map((item) => [item.importKey, "skip" satisfies ProductImportConflictAction])),
      );
      setMissingActions(
        Object.fromEntries(nextPreview.missingProducts.map((item) => [item.currentKey, "keep" satisfies ProductImportMissingAction])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setAnalyzing(false);
    }
  };

  const applyImport = async () => {
    if (!preview) return;

    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: ProductImportApplyRequest = {
        token: preview.token,
        addNewProductKeys: Object.entries(newSelections)
          .filter(([, checked]) => checked)
          .map(([key]) => key),
        conflictActions,
        missingActions,
      };

      const res = await fetch("/api/admin/products/import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не удалось применить импорт");
        return;
      }

      setSuccess(
        `Импорт завершен: добавлено ${json.addedCount}, обновлено ${json.updatedCount}, скрыто ${json.hiddenCount}, удалено ${json.deletedCount}.`,
      );
      setPreview(null);
      setFile(null);
      setNewSelections({});
      setConflictActions({});
      setMissingActions({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Импорт товаров из JSON</h2>
        <p className="mt-1 text-sm text-slate-500">
          Загрузите новый `products.json`, получите предпросмотр изменений и подтвердите, как обработать новые, конфликтные и отсутствующие товары.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="max-w-sm text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-slate-200"
        />
        <button
          onClick={analyzeImport}
          disabled={!file || analyzing}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {analyzing ? "Анализ…" : "Проверить импорт"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Текущих товаров" value={preview.currentCount} />
            <StatCard label="Во входном JSON" value={preview.incomingCount} />
            <StatCard label="Точных обновлений" value={preview.exactMatchCount} />
            <StatCard label="Новых товаров" value={preview.newProducts.length} />
            <StatCard label="Конфликтов" value={preview.conflicts.length} />
            <StatCard label="Отсутствуют в JSON" value={preview.missingProducts.length} />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <div>Новые к добавлению: {selectedNewCount}</div>
            <div>Конфликтов к решению: {preview.conflicts.length}</div>
            <div>Отсутствующих товаров к обработке: {preview.missingProducts.length}</div>
          </div>

          <PreviewBlock title="Новые товары" count={preview.newProducts.length}>
            {preview.newProducts.length === 0 ? (
              <EmptyState text="Новых товаров не найдено" />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Добавить</th>
                    <th className="px-3 py-2 font-semibold">SKU</th>
                    <th className="px-3 py-2 font-semibold">Товар</th>
                    <th className="px-3 py-2 font-semibold">Раздел</th>
                    <th className="px-3 py-2 font-semibold">Цена</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.newProducts.map((item) => (
                    <tr key={item.importKey}>
                      <td className="px-3 py-2 align-top">
                        <input
                          type="checkbox"
                          checked={newSelections[item.importKey] ?? true}
                          onChange={(e) =>
                            setNewSelections((prev) => ({ ...prev, [item.importKey]: e.target.checked }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-3 py-2 align-top font-medium text-slate-900">{item.sku || "—"}</td>
                      <td className="px-3 py-2 align-top text-slate-900">{item.name}</td>
                      <td className="px-3 py-2 align-top text-slate-600">{item.sectionName}</td>
                      <td className="px-3 py-2 align-top text-slate-900">{formatPrice(item.price, item.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PreviewBlock>

          <PreviewBlock title="Конфликтные товары" count={preview.conflicts.length}>
            {preview.conflicts.length === 0 ? (
              <EmptyState text="Конфликтов не найдено" />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Решение</th>
                    <th className="px-3 py-2 font-semibold">Входной товар</th>
                    <th className="px-3 py-2 font-semibold">Совпадение по SKU</th>
                    <th className="px-3 py-2 font-semibold">Совпадение по ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.conflicts.map((item) => (
                    <tr key={item.importKey}>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={conflictActions[item.importKey] ?? "skip"}
                          onChange={(e) =>
                            setConflictActions((prev) => ({
                              ...prev,
                              [item.importKey]: e.target.value as ProductImportConflictAction,
                            }))
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                        >
                          <option value="skip">Пропустить</option>
                          {item.currentBySku && <option value="use-sku">Обновить найденный по SKU</option>}
                          {item.currentById && <option value="use-id">Обновить найденный по ID</option>}
                        </select>
                        <div className="mt-1 text-xs text-slate-400">
                          Тип конфликта: {renderConflictType(item.conflictType)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <ProductMiniCard
                          title={item.name}
                          sku={item.sku}
                          subtitle={item.sectionName}
                          meta={formatPrice(item.price, item.currency)}
                        />
                      </td>
                      <td className="px-3 py-2 align-top">
                        {item.currentBySku ? (
                          <CurrentProductCard product={item.currentBySku} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {item.currentById ? (
                          <CurrentProductCard product={item.currentById} />
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PreviewBlock>

          <PreviewBlock title="Товары, которых нет в новом JSON" count={preview.missingProducts.length}>
            {preview.missingProducts.length === 0 ? (
              <EmptyState text="Все текущие товары присутствуют в новом JSON" />
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Что сделать</th>
                    <th className="px-3 py-2 font-semibold">SKU</th>
                    <th className="px-3 py-2 font-semibold">Товар</th>
                    <th className="px-3 py-2 font-semibold">Раздел</th>
                    <th className="px-3 py-2 font-semibold">Статус</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.missingProducts.map((item) => (
                    <tr key={item.currentKey}>
                      <td className="px-3 py-2 align-top">
                        <select
                          value={missingActions[item.currentKey] ?? "keep"}
                          onChange={(e) =>
                            setMissingActions((prev) => ({
                              ...prev,
                              [item.currentKey]: e.target.value as ProductImportMissingAction,
                            }))
                          }
                          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                        >
                          <option value="keep">Оставить в каталоге</option>
                          <option value="hide">Сделать невидимым</option>
                          <option value="delete">Удалить из каталога</option>
                        </select>
                      </td>
                      <td className="px-3 py-2 align-top font-medium text-slate-900">{item.product.sku || "—"}</td>
                      <td className="px-3 py-2 align-top text-slate-900">{item.product.name}</td>
                      <td className="px-3 py-2 align-top text-slate-600">{item.product.sectionName}</td>
                      <td className="px-3 py-2 align-top text-slate-600">
                        {item.product.visible ? "Сейчас виден" : "Сейчас скрыт"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </PreviewBlock>

          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setPreview(null)}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50"
            >
              Закрыть предпросмотр
            </button>
            <button
              onClick={applyImport}
              disabled={applying}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {applying ? "Применение…" : "Применить импорт"}
            </button>
          </div>
        </div>
      )}

      <ImportHistory />
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
    </div>
  );
}

function PreviewBlock({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-500">{count}</span>
      </div>
      <div className="max-h-[28rem] overflow-auto">{children}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-6 text-sm text-slate-500">{text}</div>;
}

function ProductMiniCard({
  title,
  sku,
  subtitle,
  meta,
}: {
  title: string;
  sku: string;
  subtitle: string;
  meta: string;
}) {
  return (
    <div className="space-y-1">
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">SKU: {sku || "—"}</div>
      <div className="text-xs text-slate-500">{subtitle || "—"}</div>
      <div className="text-xs text-slate-700">{meta}</div>
    </div>
  );
}

function CurrentProductCard({ product }: { product: ProductImportPreview["conflicts"][number]["currentBySku"] }) {
  if (!product) return null;

  return (
    <div className="space-y-1">
      <div className="font-semibold text-slate-900">{product.name}</div>
      <div className="text-xs text-slate-500">SKU: {product.sku || "—"}</div>
      <div className="text-xs text-slate-500">Раздел: {product.sectionName || "—"}</div>
      <div className="text-xs text-slate-700">{formatPrice(product.price, product.currency)}</div>
    </div>
  );
}

function renderConflictType(type: ProductImportPreview["conflicts"][number]["conflictType"]) {
  switch (type) {
    case "sku":
      return "совпадает SKU, номер отличается";
    case "id":
      return "совпадает ID, SKU отличается";
    case "cross":
      return "SKU и ID указывают на разные товары";
    case "duplicate":
      return "дубликат во входном JSON";
    default:
      return type;
  }
}
