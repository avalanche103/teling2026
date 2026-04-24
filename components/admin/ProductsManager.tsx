"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type { AdminProductListItem, ProductDocument, SectionRaw } from "@/lib/types";

const PAGE_SIZE = 100;

interface ProductsResponse {
  items: AdminProductListItem[];
  total: number;
  page: number;
  limit: number;
}

interface EditFormState {
  customName: string;
  brand: string;
  sectionId: string;
  price: string;
  priceWithoutVat: string;
  description: string;
  pictureUrl: string;
  documentsText: string;
}

interface CreateFormState {
  name: string;
  sku: string;
  brand: string;
  sectionId: string;
  price: string;
  priceWithoutVat: string;
  description: string;
  pictureUrl: string;
  documentsText: string;
}

function formatDocumentsForTextarea(docs: ProductDocument[] | undefined): string {
  if (!docs?.length) return "";
  return docs
    .map((doc) => `${doc.type || "Документ"}|${doc.name}|${doc.url}`)
    .join("\n");
}

function parseDocumentsFromTextarea(text: string): ProductDocument[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const parts = line.split("|").map((part) => part.trim());
      if (parts.length >= 3) {
        return {
          type: parts[0] || "Документ",
          name: parts[1],
          url: parts.slice(2).join("|"),
        };
      }
      if (parts.length === 2) {
        return {
          type: "Документ",
          name: parts[0],
          url: parts[1],
        };
      }
      return {
        type: "Документ",
        name: parts[0],
        url: parts[0],
      };
    })
    .filter((doc) => doc.name && doc.url)
    .slice(0, 50);
}

export function ProductsManager() {
  const [sections, setSections] = useState<SectionRaw[]>([]);
  const [products, setProducts] = useState<AdminProductListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingSave, setEditingSave] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string>("");
  const [draftVisibility, setDraftVisibility] = useState<Record<number, boolean>>({});
  const [editForm, setEditForm] = useState<EditFormState>({
    customName: "",
    brand: "",
    sectionId: "",
    price: "",
    priceWithoutVat: "",
    description: "",
    pictureUrl: "",
    documentsText: "",
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [createForm, setCreateForm] = useState<CreateFormState>({
    name: "",
    sku: "",
    brand: "",
    sectionId: "",
    price: "",
    priceWithoutVat: "",
    description: "",
    pictureUrl: "",
    documentsText: "",
  });

  const loadSections = useCallback(async () => {
    const res = await fetch("/api/admin/sections", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: SectionRaw[] = await res.json();
    setSections(data);
  }, []);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (query) params.set("query", query);
      if (sectionId) params.set("sectionId", sectionId);

      const res = await fetch(`/api/admin/products?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: ProductsResponse = await res.json();
      setProducts(data.items);
      setTotal(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }, [page, query, sectionId]);

  useEffect(() => {
    loadSections().catch((e) => {
      setError(e instanceof Error ? e.message : "Не удалось загрузить разделы");
    });
  }, [loadSections]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dirtyCount = Object.keys(draftVisibility).length;

  const visibleProducts = useMemo(
    () => products.map((product) => ({
      ...product,
      visible: draftVisibility[product.id] ?? product.visible,
    })),
    [products, draftVisibility],
  );

  const pageHasItems = visibleProducts.length > 0;
  const allPageVisible = pageHasItems && visibleProducts.every((product) => product.visible);
  const allPageHidden = pageHasItems && visibleProducts.every((product) => !product.visible);

  const applyFilters = () => {
    setSaveSuccess(null);
    setSaveError(null);
    setPage(1);
    setQuery(queryInput.trim());
  };

  const toggleVisibility = (product: AdminProductListItem, checked: boolean) => {
    setDraftVisibility((prev) => {
      const next = { ...prev };
      if (checked === product.visible) {
        delete next[product.id];
      } else {
        next[product.id] = checked;
      }
      return next;
    });
    setSaveSuccess(null);
    setSaveError(null);
  };

  const resetDrafts = () => {
    setDraftVisibility({});
    setSaveError(null);
    setSaveSuccess(null);
  };

  const setPageVisibility = (nextVisible: boolean) => {
    setDraftVisibility((prev) => {
      const next = { ...prev };
      for (const product of products) {
        if (product.visible === nextVisible) {
          delete next[product.id];
        } else {
          next[product.id] = nextVisible;
        }
      }
      return next;
    });
    setSaveError(null);
    setSaveSuccess(null);
  };

  const runBulkVisibility = async (nextVisible: boolean) => {
    setBulkSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bulk: {
            visible: nextVisible,
            query,
            sectionId: sectionId ? Number(sectionId) : null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка массового обновления");
        return;
      }

      setDraftVisibility({});
      setSaveSuccess(`Массово обновлено товаров: ${json.updatedCount}`);
      await loadProducts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setBulkSaving(false);
    }
  };

  const startEditing = (product: AdminProductListItem) => {
    setEditingId(product.id);
    setEditForm({
      customName: product.customName ?? "",
      brand: product.brand,
      sectionId: String(product.sectionId),
      price: String(product.price ?? 0),
      priceWithoutVat: String(product.priceWithoutVat ?? 0),
      description: product.description ?? "",
      pictureUrl: product.picture ?? "",
      documentsText: formatDocumentsForTextarea(product.documents),
    });
    setSaveError(null);
    setSaveSuccess(null);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingSave(false);
  };

  const saveProduct = async () => {
    if (editingId == null) return;

    const sectionIdValue = parseInt(editForm.sectionId, 10);
    const priceValue = Number(editForm.price.replace(",", "."));
    const priceWithoutVatValue = Number(editForm.priceWithoutVat.replace(",", "."));

    if (!Number.isInteger(sectionIdValue)) {
      setSaveError("Выберите раздел товара");
      return;
    }

    if (!Number.isFinite(priceValue) || !Number.isFinite(priceWithoutVatValue)) {
      setSaveError("Цены должны быть числами");
      return;
    }

    setEditingSave(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const documents = parseDocumentsFromTextarea(editForm.documentsText);
      const currentProduct = visibleProducts.find((product) => product.id === editingId);
      const res = await fetch(`/api/admin/products/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          custom_name: editForm.customName.trim() || null,
          brand: editForm.brand.trim(),
          section_id: sectionIdValue,
          price: priceValue,
          price_without_vat: priceWithoutVatValue,
          description: editForm.description.trim(),
          picture_url: editForm.pictureUrl.trim(),
          documents,
          visible: currentProduct?.visible,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка сохранения товара");
        return;
      }

      setEditingId(null);
      setSaveSuccess("Товар обновлен");
      await loadProducts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setEditingSave(false);
    }
  };

  const deleteProduct = async (product: AdminProductListItem) => {
    const confirmed = window.confirm(
      `Удалить товар "${product.name}" (SKU: ${product.sku || "—"})?`
    );
    if (!confirmed) return;

    setDeletingId(product.id);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch(`/api/admin/products/${product.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка удаления товара");
        return;
      }

      if (editingId === product.id) {
        setEditingId(null);
      }
      setSaveSuccess("Товар удален");
      await loadProducts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setDeletingId(null);
    }
  };

  const createProduct = async () => {
    const sectionIdValue = parseInt(createForm.sectionId, 10);
    const priceValue = Number(createForm.price.replace(",", "."));
    const priceWithoutVatValue = Number(createForm.priceWithoutVat.replace(",", "."));

    if (!createForm.name.trim()) {
      setSaveError("Введите название товара");
      return;
    }
    if (!createForm.sku.trim()) {
      setSaveError("Введите SKU товара");
      return;
    }
    if (!Number.isInteger(sectionIdValue)) {
      setSaveError("Выберите раздел товара");
      return;
    }
    if (!Number.isFinite(priceValue) || !Number.isFinite(priceWithoutVatValue)) {
      setSaveError("Цены должны быть числами");
      return;
    }

    setCreateSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const documents = parseDocumentsFromTextarea(createForm.documentsText);
      const res = await fetch("/api/admin/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name.trim(),
          sku: createForm.sku.trim(),
          brand: createForm.brand.trim(),
          section_id: sectionIdValue,
          price: priceValue,
          price_without_vat: priceWithoutVatValue,
          description: createForm.description.trim(),
          picture_url: createForm.pictureUrl.trim(),
          documents,
          visible: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка создания товара");
        return;
      }

      setShowCreateForm(false);
      setCreateForm({ name: "", sku: "", brand: "", sectionId: "", price: "", priceWithoutVat: "", description: "", pictureUrl: "", documentsText: "" });
      setSaveSuccess(`Товар "${createForm.name.trim()}" создан`);
      await loadProducts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setCreateSaving(false);
    }
  };

  const saveChanges = async () => {
    const updates = Object.entries(draftVisibility).map(([id, visible]) => ({
      id: Number(id),
      visible,
    }));

    if (updates.length === 0) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка сохранения");
        return;
      }

      setDraftVisibility({});
      setSaveSuccess(`Сохранено изменений: ${json.updatedCount}`);
      await loadProducts();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={queryInput}
          onChange={(e) => setQueryInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") applyFilters();
          }}
          placeholder="Поиск по SKU, названию, бренду или ID…"
          className="h-9 w-80 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
        />
        <select
          value={sectionId}
          onChange={(e) => {
            setSectionId(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
        >
          <option value="">Все разделы</option>
          {sections
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, "ru"))
            .map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
        </select>
        <button
          onClick={applyFilters}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Найти
        </button>
        <button
          onClick={() => {
            setQueryInput("");
            setQuery("");
            setSectionId("");
            setPage(1);
          }}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Сбросить фильтры
        </button>
        <button
          onClick={() => {
            setShowCreateForm((v) => !v);
            setSaveError(null);
            setSaveSuccess(null);
          }}
          className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
        >
          {showCreateForm ? "Отмена" : "+ Новый товар"}
        </button>
        <button
          onClick={() => setPageVisibility(true)}
          disabled={!pageHasItems || allPageVisible}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Показать страницу
        </button>
        <button
          onClick={() => setPageVisibility(false)}
          disabled={!pageHasItems || allPageHidden}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Скрыть страницу
        </button>
        <button
          onClick={() => runBulkVisibility(true)}
          disabled={total === 0 || bulkSaving}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkSaving ? "Обновление…" : "Показать найденные"}
        </button>
        <button
          onClick={() => runBulkVisibility(false)}
          disabled={total === 0 || bulkSaving}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {bulkSaving ? "Обновление…" : "Скрыть найденные"}
        </button>
        <div className="ml-auto flex items-center gap-2">
          {dirtyCount > 0 && (
            <button
              onClick={resetDrafts}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Сбросить изменения
            </button>
          )}
          <button
            onClick={saveChanges}
            disabled={dirtyCount === 0 || saving}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Сохранение…" : `Сохранить (${dirtyCount})`}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-emerald-800">
            Новый товар
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Название <span className="text-red-500">*</span>
              </label>
              <input
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="Название товара"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                SKU <span className="text-red-500">*</span>
              </label>
              <input
                value={createForm.sku}
                onChange={(e) => setCreateForm({ ...createForm, sku: e.target.value })}
                placeholder="Артикул / SKU"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Раздел <span className="text-red-500">*</span>
              </label>
              <select
                value={createForm.sectionId}
                onChange={(e) => setCreateForm({ ...createForm, sectionId: e.target.value })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              >
                <option value="">— Выберите раздел —</option>
                {sections
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                  .map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Бренд
              </label>
              <input
                value={createForm.brand}
                onChange={(e) => setCreateForm({ ...createForm, brand: e.target.value })}
                placeholder="Производитель"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Цена с НДС
              </label>
              <input
                value={createForm.price}
                onChange={(e) => setCreateForm({ ...createForm, price: e.target.value })}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Цена без НДС
              </label>
              <input
                value={createForm.priceWithoutVat}
                onChange={(e) => setCreateForm({ ...createForm, priceWithoutVat: e.target.value })}
                placeholder="0"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ссылка на картинку
              </label>
              <input
                value={createForm.pictureUrl}
                onChange={(e) => setCreateForm({ ...createForm, pictureUrl: e.target.value })}
                placeholder="https://example.com/image.jpg"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                Описание товара
              </label>
              <textarea
                value={createForm.description}
                onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                placeholder="Описание товара..."
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-blue-400 transition focus:ring-2"
              />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setShowCreateForm(false);
                setCreateForm({ name: "", sku: "", brand: "", sectionId: "", price: "", priceWithoutVat: "", description: "", pictureUrl: "", documentsText: "" });
                setSaveError(null);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              Отмена
            </button>
            <button
              onClick={createProduct}
              disabled={createSaving}
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {createSaving ? "Создание…" : "Создать товар"}
            </button>
          </div>
        </div>
      )}

      {saveSuccess && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
          {saveSuccess}
        </div>
      )}

      {saveError && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm text-slate-700">
          {saveError}
        </div>
      )}

      {error ? (
        <div className="rounded-2xl border border-slate-300 bg-slate-100 px-6 py-4 text-slate-700">
          Ошибка загрузки: {error}
        </div>
      ) : loading ? (
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-slate-500">
          <span className="animate-spin text-xl">⟳</span>
          <span>Загрузка товаров…</span>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Показывать</th>
                    <th className="px-4 py-3 font-semibold">SKU</th>
                    <th className="px-4 py-3 font-semibold">Товар</th>
                    <th className="px-4 py-3 font-semibold">Раздел</th>
                    <th className="px-4 py-3 font-semibold">Бренд</th>
                    <th className="px-4 py-3 font-semibold">Цена</th>
                    <th className="px-4 py-3 font-semibold">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visibleProducts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Товары не найдены
                      </td>
                    </tr>
                  ) : (
                    visibleProducts.map((product) => (
                      <FragmentRow
                        key={product.id}
                        product={product}
                        isEditing={editingId === product.id}
                        sections={sections}
                        editForm={editForm}
                        editingSave={editingSave}
                        deleting={deletingId === product.id}
                        onToggleVisibility={toggleVisibility}
                        onStartEditing={startEditing}
                        onCancelEditing={cancelEditing}
                        onChangeEditForm={setEditForm}
                        onSaveProduct={saveProduct}
                        onDeleteProduct={deleteProduct}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
            <span>
              Всего товаров: {total}
            </span>
            <span>
              Страница {page} из {totalPages}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Назад
              </button>
              <button
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Вперед
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface FragmentRowProps {
  product: AdminProductListItem;
  isEditing: boolean;
  sections: SectionRaw[];
  editForm: EditFormState;
  editingSave: boolean;
  deleting: boolean;
  onToggleVisibility: (product: AdminProductListItem, checked: boolean) => void;
  onStartEditing: (product: AdminProductListItem) => void;
  onCancelEditing: () => void;
  onChangeEditForm: (next: EditFormState) => void;
  onSaveProduct: () => void;
  onDeleteProduct: (product: AdminProductListItem) => void;
}

function FragmentRow({
  product,
  isEditing,
  sections,
  editForm,
  editingSave,
  deleting,
  onToggleVisibility,
  onStartEditing,
  onCancelEditing,
  onChangeEditForm,
  onSaveProduct,
  onDeleteProduct,
}: FragmentRowProps) {
  return (
    <>
      <tr className={product.visible ? "" : "bg-slate-50/70"}>
        <td className="px-4 py-3 align-top">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={product.visible}
              onChange={(e) => onToggleVisibility(product, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-xs text-slate-500">
              {product.visible ? "Виден" : "Скрыт"}
            </span>
          </label>
        </td>
        <td className="px-4 py-3 align-top font-medium text-slate-900">
          {product.sku ? (
            <Link href={`/product/${product.sku}`} className="hover:underline">
              {product.sku}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 align-top text-slate-900">{product.name}</td>
        <td className="px-4 py-3 align-top text-slate-600">{product.sectionName}</td>
        <td className="px-4 py-3 align-top text-slate-600">{product.brand || "—"}</td>
        <td className="px-4 py-3 align-top text-slate-900">
          {formatPrice(product.price, product.currency)}
        </td>
        <td className="px-4 py-3 align-top">
          <button
            onClick={() => (isEditing ? onCancelEditing() : onStartEditing(product))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            {isEditing ? "Свернуть" : "Редактировать"}
          </button>
        </td>
      </tr>

      {isEditing && (
        <tr className="bg-slate-50/70">
          <td colSpan={7} className="px-4 py-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Название на сайте
                  </label>
                  <input
                    value={editForm.customName}
                    onChange={(e) => onChangeEditForm({ ...editForm, customName: e.target.value })}
                    placeholder={product.originalName || product.name}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Оригинальное название: {product.originalName || "—"}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Бренд
                  </label>
                  <input
                    value={editForm.brand}
                    onChange={(e) => onChangeEditForm({ ...editForm, brand: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Поставщик: {product.vendor || "—"}
                  </p>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Раздел
                  </label>
                  <select
                    value={editForm.sectionId}
                    onChange={(e) => onChangeEditForm({ ...editForm, sectionId: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  >
                    {sections
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, "ru"))
                      .map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Цена с НДС
                  </label>
                  <input
                    value={editForm.price}
                    onChange={(e) => onChangeEditForm({ ...editForm, price: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Цена без НДС
                  </label>
                  <input
                    value={editForm.priceWithoutVat}
                    onChange={(e) => onChangeEditForm({ ...editForm, priceWithoutVat: e.target.value })}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ссылка на картинку
                  </label>
                  <input
                    value={editForm.pictureUrl}
                    onChange={(e) => onChangeEditForm({ ...editForm, pictureUrl: e.target.value })}
                    placeholder="https://example.com/image.jpg"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    SKU
                  </label>
                  <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                    {product.sku || "—"}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Описание товара
                  </label>
                  <textarea
                    value={editForm.description}
                    onChange={(e) => onChangeEditForm({ ...editForm, description: e.target.value })}
                    placeholder="Описание товара..."
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                </div>

                <div className="lg:col-span-2">
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Документы (каждая строка: Тип|Название|URL)
                  </label>
                  <textarea
                    value={editForm.documentsText}
                    onChange={(e) => onChangeEditForm({ ...editForm, documentsText: e.target.value })}
                    placeholder={"PDF|Паспорт товара|https://example.com/passport.pdf"}
                    rows={4}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-blue-400 transition focus:ring-2"
                  />
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => onDeleteProduct(product)}
                  disabled={deleting || editingSave}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {deleting ? "Удаление…" : "Удалить товар"}
                </button>
                <button
                  onClick={onCancelEditing}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  Отмена
                </button>
                <button
                  onClick={onSaveProduct}
                  disabled={editingSave}
                  className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {editingSave ? "Сохранение…" : "Сохранить товар"}
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}