"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SectionMap, SectionMapAction } from "@/lib/microinform/store";

interface CatalogSectionOption {
  id: number;
  name: string;
  parent: number | null;
  external_id: string;
  selected_filters?: string[];
}

interface AnalysisSection {
  title: string;
  vendor: string;
  productCount: number;
  group: string;
  mapping: SectionMapAction;
}

interface AnalysisPayload {
  settings: {
    priceUrl: string;
    markupPercent: number;
    enabledVendors: string[];
  };
  sectionMap: SectionMap;
  vendors: string[];
  sections: AnalysisSection[];
  counts: {
    selectedProducts: number;
    willCreateSections: number;
    willUpsert: number;
    willSkipSections: number;
    duplicatesCollapsed: number;
  };
  duplicateArticuls: string[];
}

interface PendingProduct {
  id: number;
  sku: string;
  vendor: string;
  articul: string;
  name: string;
  section_id: number;
  section_name: string;
  price: number;
  timeDelivery: string;
  hasUrl: boolean;
  hasDescription: boolean;
  hasPictures: boolean;
  pictureCount: number;
}

interface LastSyncInfo {
  at: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  priceDate?: string | null;
  productCount?: number;
  error?: string;
  result?: {
    created: number;
    updated: number;
    hiddenAbsent: number;
    pendingNew: number;
    totalMicroinform: number;
    createdSections: string[];
  };
}

function mappingToSelectValue(mapping: SectionMapAction): string {
  if (mapping.action === "skip") return "skip";
  if (mapping.action === "existing") return `existing:${mapping.sectionId}`;
  return `create:${mapping.externalId}`;
}

function selectValueToMapping(
  value: string,
  section: AnalysisSection,
  catalog: CatalogSectionOption[],
): SectionMapAction {
  if (value === "skip") return { action: "skip" };
  if (value.startsWith("existing:")) {
    const sectionId = Number(value.slice("existing:".length));
    return { action: "existing", sectionId };
  }
  if (value.startsWith("create:")) {
    const externalId = value.slice("create:".length);
    const known = catalog.find((s) => s.external_id === externalId);
    if (known) {
      return {
        action: "create",
        name: known.name,
        externalId,
        parentId: known.parent ?? 293,
        selectedFilters: known.selected_filters?.length
          ? known.selected_filters
          : ["brand", "price"],
      };
    }
    return {
      action: "create",
      name: section.title,
      externalId,
      parentId: 293,
      selectedFilters: ["brand", "price"],
    };
  }
  return { action: "skip" };
}

export function MicroinformManager() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [priceMeta, setPriceMeta] = useState<{ fetchedAt?: string; priceDate?: string | null; productCount?: number }>(
    {},
  );
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [catalogSections, setCatalogSections] = useState<CatalogSectionOption[]>([]);
  const [sectionMap, setSectionMap] = useState<SectionMap>({});
  const [markupPercent, setMarkupPercent] = useState(0);
  const [enabledVendors, setEnabledVendors] = useState<string[]>(["D-Link", "Origo", "ATEN"]);
  const [allVendors, setAllVendors] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [selectedPending, setSelectedPending] = useState<number[]>([]);
  const [pendingSections, setPendingSections] = useState<Record<number, number>>({});
  const [lastSync, setLastSync] = useState<LastSyncInfo | null>(null);

  const loadPending = useCallback(async () => {
    const res = await fetch("/api/admin/microinform/pending", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setPending(json.products || []);
    setLastSync(json.lastSync || null);
    setSelectedPending((prev) =>
      prev.filter((id: number) => (json.products || []).some((p: PendingProduct) => p.id === id)),
    );
  }, []);

  const loadAnalyze = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/microinform/analyze", { cache: "no-store" });
    if (res.status === 404) {
      setAnalysis(null);
      setLoading(false);
      await loadPending();
      return;
    }
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Ошибка анализа");
      setLoading(false);
      return;
    }
    setPriceMeta({
      fetchedAt: json.fetchedAt,
      priceDate: json.priceDate,
      productCount: json.productCount,
    });
    setAnalysis(json.analysis);
    setSectionMap(json.analysis.sectionMap);
    setMarkupPercent(json.analysis.settings.markupPercent ?? 0);
    setEnabledVendors(json.analysis.settings.enabledVendors || ["D-Link", "Origo", "ATEN"]);
    setAllVendors(json.analysis.vendors || []);
    setCatalogSections(json.catalogSections || []);
    setLoading(false);
    await loadPending();
  }, [loadPending]);

  useEffect(() => {
    void loadAnalyze();
  }, [loadAnalyze]);

  const createOptions = useMemo(
    () =>
      catalogSections
        .filter((s) => s.parent === 293)
        .map((s) => ({
          value: `create:${s.external_id}`,
          label: `Создать: ${s.name}`,
        })),
    [catalogSections],
  );

  const existingOptions = useMemo(() => {
    const prefer = catalogSections.filter((s) => s.id === 293 || s.parent === 293);
    const rest = catalogSections.filter((s) => !prefer.some((p) => p.id === s.id));
    return [...prefer, ...rest].map((s) => ({
      value: `existing:${s.id}`,
      label: `${s.id} · ${s.name}`,
    }));
  }, [catalogSections]);

  async function handleFetch() {
    setBusy("fetch");
    setError(null);
    setMessage(null);
    try {
      await fetch("/api/admin/microinform/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markupPercent, enabledVendors }),
      });
      const res = await fetch("/api/admin/microinform/fetch", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка загрузки прайса");
      setMessage(
        `Прайс загружен (${json.productCount} позиций${json.priceDate ? `, дата ${json.priceDate}` : ""}).`,
      );
      await loadAnalyze();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    setBusy("apply");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/microinform/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionMap,
          settings: { markupPercent, enabledVendors },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка применения");
      setMessage(
        `Применено: новых ${json.created ?? 0}, обновлено ${json.updated ?? json.upserted}, скрыто ${json.hiddenAbsent ?? json.removedOrHidden ?? 0}, в очереди ${json.pendingNew ?? 0}` +
          (json.createdSections?.length ? `, разделы: ${json.createdSections.join(", ")}` : ""),
      );
      await loadAnalyze();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка применения");
    } finally {
      setBusy(null);
    }
  }

  async function handleEnrich(productIds?: number[]) {
    setBusy(productIds?.length ? "enrich-pending" : "enrich");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/microinform/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          onlyMissing: true,
          limit: productIds?.length ? Math.min(productIds.length, 100) : 30,
          ...(productIds?.length ? { productIds } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка обогащения");
      setMessage(
        `Обогащение: обработано ${json.processed}, с описанием ${json.withDescription ?? "—"}, успешно ${json.succeeded}, ошибок ${json.failed}, фото ${json.imagesDownloaded}. Можно нажать ещё раз для следующей пачки.`,
      );
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обогащения");
    } finally {
      setBusy(null);
    }
  }

  async function handlePublishSelected() {
    if (selectedPending.length === 0) return;
    setBusy("publish");
    setError(null);
    setMessage(null);
    try {
      // Publish one-by-one when section overrides differ; otherwise bulk.
      const groups = new Map<string, number[]>();
      for (const id of selectedPending) {
        const sectionId = pendingSections[id];
        const key = typeof sectionId === "number" ? String(sectionId) : "";
        const list = groups.get(key) || [];
        list.push(id);
        groups.set(key, list);
      }
      let published = 0;
      for (const [key, ids] of groups) {
        const res = await fetch("/api/admin/microinform/publish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ids,
            ...(key ? { sectionId: Number(key) } : {}),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Ошибка публикации");
        published += json.published || 0;
      }
      setMessage(`Опубликовано товаров: ${published}`);
      setSelectedPending([]);
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка публикации");
    } finally {
      setBusy(null);
    }
  }

  function togglePending(id: number) {
    setSelectedPending((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAllPending() {
    setSelectedPending((prev) =>
      prev.length === pending.length ? [] : pending.map((p) => p.id),
    );
  }

  async function handleVerifyManufacturers() {
    setBusy("verify");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/microinform/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendors: enabledVendors.length ? enabledVendors : ["D-Link", "Origo", "ATEN"],
          limit: 100,
          rebuildIndex: true,
          updateMedia: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка проверки");
      setMessage(
        json.message ||
          `Проверка D-Link/Origo/ATEN: URL ${json.urlUpdated}, названий ${json.nameUpdated}, обогащено ${json.enriched}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка проверки");
    } finally {
      setBusy(null);
    }
  }

  function toggleVendor(vendor: string) {
    setEnabledVendors((prev) =>
      prev.includes(vendor) ? prev.filter((v) => v !== vendor) : [...prev, vendor],
    );
  }

  function updateSectionMapping(title: string, value: string, section: AnalysisSection) {
    const mapping = selectValueToMapping(value, section, catalogSections);
    setSectionMap((prev) => ({ ...prev, [title]: mapping }));
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Прайс Микроинформ</h2>
            <p className="mt-1 text-sm text-slate-500">
              {priceMeta.productCount
                ? `В кэше ${priceMeta.productCount} позиций${priceMeta.priceDate ? `, дата прайса ${priceMeta.priceDate}` : ""}${priceMeta.fetchedAt ? `, загружено ${new Date(priceMeta.fetchedAt).toLocaleString("ru-RU")}` : ""}`
                : "Прайс ещё не загружен"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleFetch()}
              disabled={Boolean(busy)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy === "fetch" ? "Загрузка…" : "Обновить прайс"}
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={Boolean(busy) || !analysis}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "apply" ? "Применение…" : "Применить на сайт"}
            </button>
            <button
              type="button"
              onClick={() => void handleEnrich()}
              disabled={Boolean(busy)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "enrich" ? "Обогащение…" : "Обогатить (фото/описание)"}
            </button>
            <button
              type="button"
              onClick={() => void handleVerifyManufacturers()}
              disabled={Boolean(busy)}
              title="Сопоставить артикулы со страницами D-Link/Origo/ATEN, обновить URL, названия и описания"
              className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
            >
              {busy === "verify" ? "Проверка…" : "Проверить D-Link / Origo / ATEN"}
            </button>
          </div>
        </div>

        {error && (
          <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {message && (
          <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            {message}
          </p>
        )}

        {lastSync && (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            Последний sync:{" "}
            {new Date(lastSync.at).toLocaleString("ru-RU", { timeZone: "Europe/Minsk" })}
            {lastSync.ok
              ? ` · ок${lastSync.priceDate ? `, прайс ${lastSync.priceDate}` : ""}${
                  lastSync.result
                    ? ` · +${lastSync.result.created} / ~${lastSync.result.updated} / скрыто ${lastSync.result.hiddenAbsent} / очередь ${lastSync.result.pendingNew}`
                    : ""
                }`
              : lastSync.skipped
                ? ` · пропущен (${lastSync.reason || "busy"})`
                : ` · ошибка: ${lastSync.error || "неизвестно"}`}
          </p>
        )}

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Наценка %</span>
            <input
              type="number"
              min={0}
              step={1}
              value={markupPercent}
              onChange={(e) => setMarkupPercent(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Сейчас 0. Цена = ceil(A × (1 + наценка/100)), с НДС.
            </span>
          </label>
          <div className="text-sm">
            <div className="font-medium text-slate-700">Вендоры</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {(allVendors.length ? allVendors : ["D-Link", "Origo", "ATEN"]).map((vendor) => (
                <label
                  key={vendor}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={enabledVendors.includes(vendor)}
                    onChange={() => toggleVendor(vendor)}
                  />
                  <span>{vendor}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {analysis && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.selectedProducts}</div>
              <div className="text-xs text-slate-500">к импорту</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.willCreateSections}</div>
              <div className="text-xs text-slate-500">новых разделов</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.willSkipSections}</div>
              <div className="text-xs text-slate-500">секций skip</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.duplicatesCollapsed}</div>
              <div className="text-xs text-slate-500">дублей сжато</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.sections.length}</div>
              <div className="text-xs text-slate-500">секций вендоров</div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="font-bold text-slate-900">Новые товары</h3>
            <p className="text-xs text-slate-500">
              Скрыты на сайте, пока не обогатите и не опубликуете. Раздел можно поменять перед публикацией.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                void handleEnrich(
                  selectedPending.length ? selectedPending : pending.map((p) => p.id),
                )
              }
              disabled={Boolean(busy) || pending.length === 0}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "enrich-pending" ? "Обогащение…" : "Обогатить выбранные"}
            </button>
            <button
              type="button"
              onClick={() => void handlePublishSelected()}
              disabled={Boolean(busy) || selectedPending.length === 0}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {busy === "publish" ? "Публикация…" : `Опубликовать (${selectedPending.length})`}
            </button>
          </div>
        </div>
        {pending.length === 0 ? (
          <p className="px-5 py-6 text-sm text-slate-500">Очередь пуста — новых товаров нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPending.length === pending.length && pending.length > 0}
                      onChange={toggleAllPending}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th className="px-4 py-3">Товар</th>
                  <th className="px-4 py-3">Вендор</th>
                  <th className="px-4 py-3">Цена</th>
                  <th className="px-4 py-3">Срок</th>
                  <th className="px-4 py-3">Обогащение</th>
                  <th className="px-4 py-3">Раздел</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((product) => (
                  <tr key={product.id} className="border-t border-slate-100">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedPending.includes(product.id)}
                        onChange={() => togglePending(product.id)}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{product.name}</div>
                      <div className="text-xs text-slate-500">
                        {product.articul} · {product.sku}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{product.vendor}</td>
                    <td className="px-4 py-3 text-slate-600">{product.price.toFixed(2)}</td>
                    <td className="px-4 py-3 text-slate-600">{product.timeDelivery || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {[
                        product.hasUrl ? "URL" : null,
                        product.hasDescription ? "описание" : null,
                        product.hasPictures ? `фото ${product.pictureCount}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "пусто"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        className="w-full min-w-[200px] rounded-lg border border-slate-300 px-2 py-1.5"
                        value={pendingSections[product.id] ?? product.section_id}
                        onChange={(e) =>
                          setPendingSections((prev) => ({
                            ...prev,
                            [product.id]: Number(e.target.value),
                          }))
                        }
                      >
                        {existingOptions.map((opt) => (
                          <option key={opt.value} value={Number(opt.value.slice("existing:".length))}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {analysis && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-3">
            <h3 className="font-bold text-slate-900">Маппинг секций прайса</h3>
            <p className="text-xs text-slate-500">
              Разделы как на dlink.ru. Маршрутизаторы (DIR/DWR/…) выделяются из беспроводного по SKU.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Секция прайса</th>
                  <th className="px-4 py-3">Вендор</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Группа</th>
                  <th className="px-4 py-3">Куда на сайте</th>
                </tr>
              </thead>
              <tbody>
                {analysis.sections.map((section) => {
                  const mapping = sectionMap[section.title] || section.mapping;
                  return (
                    <tr key={section.title} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-medium text-slate-800">{section.title}</td>
                      <td className="px-4 py-3 text-slate-600">{section.vendor}</td>
                      <td className="px-4 py-3 text-slate-600">{section.productCount}</td>
                      <td className="px-4 py-3 text-slate-600">{section.group}</td>
                      <td className="px-4 py-3">
                        <select
                          className="w-full min-w-[220px] rounded-lg border border-slate-300 px-2 py-1.5"
                          value={mappingToSelectValue(mapping)}
                          onChange={(e) =>
                            updateSectionMapping(section.title, e.target.value, section)
                          }
                        >
                          <option value="skip">Пропустить</option>
                          {createOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                          {existingOptions.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
