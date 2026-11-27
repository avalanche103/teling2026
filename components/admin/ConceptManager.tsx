"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sectionSlugFromTitle } from "@/lib/concept/section-hints";
import type { SectionMap, SectionMapAction } from "@/lib/concept/store";

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
  mapping: SectionMapAction;
}

interface AnalysisPayload {
  settings: {
    usdToBynRate: number;
    markupPercent: number;
    enabledBrands: string[];
  };
  sectionMap: SectionMap;
  brands: string[];
  sections: AnalysisSection[];
  counts: {
    kiwiProducts: number;
    exfoProducts: number;
    selectedProducts: number;
    willCreateSections: number;
    willSkipSections: number;
  };
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
    return { action: "existing", sectionId: Number(value.slice("existing:".length)) };
  }
  if (value.startsWith("create:")) {
    const externalId = value.slice("create:".length);
    const known = catalog.find((s) => s.external_id === externalId);
    if (known) {
      return {
        action: "create",
        name: known.name,
        externalId,
        parentId: known.parent ?? 282,
        selectedFilters: known.selected_filters?.length
          ? known.selected_filters
          : ["brand", "price"],
      };
    }
    return {
      action: "create",
      name: section.title,
      externalId,
      parentId: 282,
      selectedFilters: ["brand", "price"],
    };
  }
  return { action: "skip" };
}

export function ConceptManager() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisPayload | null>(null);
  const [catalogSections, setCatalogSections] = useState<CatalogSectionOption[]>([]);
  const [sectionMap, setSectionMap] = useState<SectionMap>({});
  const [usdToBynRate, setUsdToBynRate] = useState(3);
  const [markupPercent, setMarkupPercent] = useState(15);
  const [enabledBrands, setEnabledBrands] = useState<string[]>(["KIWI", "EXFO"]);
  const [kiwiMeta, setKiwiMeta] = useState<{ fetchedAt?: string; sourceName?: string; productCount?: number } | null>(
    null,
  );
  const [exfoMeta, setExfoMeta] = useState<{
    fetchedAt?: string;
    productCount?: number;
    sources?: string[];
    warnings?: string[];
    addedSincePrevious?: number;
    inStore?: number;
    willCreate?: number;
    willUpdate?: number;
    conceptCount?: number;
  } | null>(null);
  const [pending, setPending] = useState<PendingProduct[]>([]);
  const [selectedPending, setSelectedPending] = useState<number[]>([]);
  const [pendingSections, setPendingSections] = useState<Record<number, number>>({});

  const loadPending = useCallback(async () => {
    const res = await fetch("/api/admin/concept/pending", { cache: "no-store" });
    if (!res.ok) return;
    const json = await res.json();
    setPending(json.products || []);
    setSelectedPending((prev) =>
      prev.filter((id) => (json.products || []).some((p: PendingProduct) => p.id === id)),
    );
  }, []);

  const loadAnalyze = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/concept/analyze", { cache: "no-store" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Ошибка анализа");
      setLoading(false);
      return;
    }
    setKiwiMeta(json.kiwi);
    setExfoMeta(json.exfo);
    setAnalysis(json.analysis);
    setSectionMap(json.analysis.sectionMap);
    setUsdToBynRate(json.analysis.settings.usdToBynRate ?? 3);
    setMarkupPercent(json.analysis.settings.markupPercent ?? 15);
    setEnabledBrands(json.analysis.settings.enabledBrands || ["KIWI", "EXFO"]);
    setCatalogSections(json.catalogSections || []);
    setLoading(false);
    await loadPending();
  }, [loadPending]);

  useEffect(() => {
    void loadAnalyze();
  }, [loadAnalyze]);

  const existingOptions = useMemo(() => {
    const prefer = catalogSections.filter((s) => s.id === 282 || s.parent === 282);
    const rest = catalogSections.filter((s) => !prefer.some((p) => p.id === s.id));
    return [...prefer, ...rest].map((s) => ({
      value: `existing:${s.id}`,
      label: `${s.id} · ${s.name}`,
    }));
  }, [catalogSections]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Выберите файл прайса KIWI (.xls)");
      return;
    }
    setBusy("upload");
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("usdToBynRate", String(usdToBynRate));
      form.append("markupPercent", String(markupPercent));
      const res = await fetch("/api/admin/concept/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка загрузки прайса");
      setMessage(`KIWI прайс загружен: ${json.productCount} позиций (${json.sourceName}).`);
      await loadAnalyze();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setBusy(null);
    }
  }

  async function handleExfoFetch() {
    setBusy("exfo");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/concept/exfo-fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scrapeRemote: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка EXFO");
      setExfoMeta({
        fetchedAt: json.fetchedAt,
        productCount: json.productCount,
        sources: json.sources,
        warnings: json.warnings,
        addedSincePrevious: json.addedSincePrevious,
        inStore: json.inStore,
        willCreate: json.willCreate,
        willUpdate: json.willUpdate,
        conceptCount: json.inStore,
      });
      const warn =
        Array.isArray(json.warnings) && json.warnings.length
          ? `. ${json.warnings.slice(0, 3).join("; ")}`
          : json.warning
            ? `. ${json.warning}`
            : "";
      setMessage(
        `EXFO кэш: ${json.productCount} позиций` +
          (json.sources?.length ? ` (${json.sources.join("+")})` : "") +
          `; новых в кэше ${json.addedSincePrevious ?? 0}` +
          `; в магазине ${json.inStore ?? 0}` +
          `; при применении: +${json.willCreate ?? 0} / обн. ${json.willUpdate ?? 0}` +
          warn,
      );
      await loadAnalyze();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка EXFO");
    } finally {
      setBusy(null);
    }
  }

  async function handleApply() {
    setBusy("apply");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/concept/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionMap,
          settings: { usdToBynRate, markupPercent, enabledBrands },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Ошибка применения");
      setMessage(
        `Применено: KIWI ${json.kiwiApplied ?? 0}, EXFO ${json.exfoApplied ?? 0}; новых ${json.created}, обновлено ${json.updated}, скрыто ${json.hiddenAbsent}, очередь ${json.pendingNew}` +
          (json.createdSections?.length ? `; разделы: ${json.createdSections.join(", ")}` : ""),
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
      const res = await fetch("/api/admin/concept/enrich", {
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
        `Обогащение: обработано ${json.processed}, успешно ${json.succeeded}, ошибок ${json.failed}, фото ${json.imagesDownloaded}.`,
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
        const res = await fetch("/api/admin/concept/publish", {
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

  function toggleBrand(brand: string) {
    setEnabledBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand],
    );
  }

  function updateSectionMapping(title: string, value: string, section: AnalysisSection) {
    setSectionMap((prev) => ({
      ...prev,
      [title]: selectValueToMapping(value, section, catalogSections),
    }));
  }

  if (loading) {
    return <p className="text-sm text-slate-500">Загрузка…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Концепт технологии</h2>
            <p className="mt-1 text-sm text-slate-500">
              KIWI:{" "}
              {kiwiMeta?.productCount
                ? `${kiwiMeta.productCount} позиций${kiwiMeta.sourceName ? ` (${kiwiMeta.sourceName})` : ""}`
                : "прайс не загружен"}
              {" · "}
              EXFO:{" "}
              {exfoMeta?.productCount
                ? `${exfoMeta.productCount} в кэше` +
                  (exfoMeta.sources?.length ? ` (${exfoMeta.sources.join("+")})` : "") +
                  (typeof exfoMeta.conceptCount === "number"
                    ? `, ${exfoMeta.conceptCount} на сайте`
                    : "") +
                  (typeof exfoMeta.willCreate === "number" && exfoMeta.willCreate > 0
                    ? `, +${exfoMeta.willCreate} к применению`
                    : "")
                : "каталог не загружен"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={Boolean(busy)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {busy === "upload" ? "Загрузка…" : "Загрузить прайс KIWI"}
            </button>
            <button
              type="button"
              onClick={() => void handleExfoFetch()}
              disabled={Boolean(busy)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "exfo" ? "EXFO…" : "Обновить EXFO"}
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
              {busy === "enrich" ? "Обогащение…" : "Обогатить"}
            </button>
          </div>
        </div>

        <div className="mt-4">
          <input
            ref={fileRef}
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-800"
          />
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

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Курс USD → BYN</span>
            <input
              type="number"
              min={0.01}
              step={0.01}
              value={usdToBynRate}
              onChange={(e) => setUsdToBynRate(Number(e.target.value) || 0)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
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
              Цена = roundVAT(USD × курс × (1 + наценка/100)), НДС 20%.
            </span>
          </label>
          <div className="text-sm">
            <div className="font-medium text-slate-700">Бренды</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {["KIWI", "EXFO"].map((brand) => (
                <label
                  key={brand}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={enabledBrands.includes(brand)}
                    onChange={() => toggleBrand(brand)}
                  />
                  <span>{brand}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">EXFO всегда «По запросу».</p>
          </div>
        </div>

        {analysis && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.selectedProducts}</div>
              <div className="text-xs text-slate-500">к импорту</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.kiwiProducts}</div>
              <div className="text-xs text-slate-500">KIWI в прайсе</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.exfoProducts}</div>
              <div className="text-xs text-slate-500">EXFO в кэше</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.willCreateSections}</div>
              <div className="text-xs text-slate-500">новых разделов</div>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-center">
              <div className="text-xl font-bold text-slate-900">{analysis.counts.willSkipSections}</div>
              <div className="text-xs text-slate-500">секций skip</div>
            </div>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="font-bold text-slate-900">Маппинг разделов</h3>
          <p className="text-xs text-slate-500">
            Секции прайса KIWI и EXFO → существующие разделы каталога (489 рефлектометры и т.д.).
          </p>
        </div>
        <div className="divide-y divide-slate-100">
          {(analysis?.sections || []).map((section) => (
            <div
              key={`${section.vendor}:${section.title}`}
              className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"
            >
              <div className="min-w-[220px] flex-1">
                <div className="font-medium text-slate-900">{section.title}</div>
                <div className="text-xs text-slate-500">
                  {section.vendor} · {section.productCount} поз.
                </div>
              </div>
              <select
                className="min-w-[260px] rounded-lg border border-slate-300 px-3 py-2"
                value={mappingToSelectValue(sectionMap[section.title] || { action: "skip" })}
                onChange={(e) => updateSectionMapping(section.title, e.target.value, section)}
              >
                <option value="skip">Пропустить</option>
                {existingOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
                <option value={`create:${sectionSlugFromTitle(section.title)}`}>
                  Создать новый раздел
                </option>
              </select>
            </div>
          ))}
          {!analysis?.sections?.length && (
            <p className="px-5 py-6 text-sm text-slate-500">
              Загрузите прайс KIWI и/или обновите EXFO, чтобы увидеть секции.
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3">
          <div>
            <h3 className="font-bold text-slate-900">Новые товары</h3>
            <p className="text-xs text-slate-500">
              Скрыты на сайте, пока не обогатите и не опубликуете.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleEnrich(selectedPending)}
              disabled={Boolean(busy) || selectedPending.length === 0}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              Обогатить выбранные
            </button>
            <button
              type="button"
              onClick={() => void handlePublishSelected()}
              disabled={Boolean(busy) || selectedPending.length === 0}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Опубликовать ({selectedPending.length})
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={pending.length > 0 && selectedPending.length === pending.length}
                    onChange={() =>
                      setSelectedPending((prev) =>
                        prev.length === pending.length ? [] : pending.map((p) => p.id),
                      )
                    }
                  />
                </th>
                <th className="px-3 py-2">Бренд</th>
                <th className="px-3 py-2">Артикул</th>
                <th className="px-3 py-2">Название</th>
                <th className="px-3 py-2">Цена</th>
                <th className="px-3 py-2">Раздел</th>
                <th className="px-3 py-2">Контент</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedPending.includes(p.id)}
                      onChange={() =>
                        setSelectedPending((prev) =>
                          prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2">{p.vendor}</td>
                  <td className="px-3 py-2 font-mono text-xs">{p.articul}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">
                    {p.price > 0 ? `${p.price} Br` : "По запросу"}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      className="max-w-[220px] rounded border border-slate-200 px-2 py-1 text-xs"
                      value={pendingSections[p.id] ?? p.section_id}
                      onChange={(e) =>
                        setPendingSections((prev) => ({
                          ...prev,
                          [p.id]: Number(e.target.value),
                        }))
                      }
                    >
                      {existingOptions.map((opt) => (
                        <option key={opt.value} value={Number(opt.value.replace("existing:", ""))}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {[
                      p.hasDescription ? "описание" : null,
                      p.hasPictures ? `фото ${p.pictureCount}` : null,
                      p.hasUrl ? "url" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                </tr>
              ))}
              {!pending.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-sm text-slate-500">
                    Нет товаров в очереди публикации.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
