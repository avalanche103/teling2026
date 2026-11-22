"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SectionRaw, SectionFilterOption } from "@/lib/types";
import { slugify } from "@/lib/slugify";

// ---- types ----

interface TreeNode extends SectionRaw {
  children: TreeNode[];
}

interface FormValues {
  name: string;
  external_id: string;
  sort: string;
  picture: string;
  parent: number | null;
  selected_filters: string[];
}

type Mode =
  | { type: "idle" }
  | { type: "add"; parentId: number | null }
  | { type: "edit"; section: SectionRaw };

// ---- tree builder ----

function buildTree(sections: SectionRaw[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const s of sections) {
    map.set(s.id, { ...s, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const node of map.values()) {
    if (node.parent == null) {
      roots.push(node);
    } else {
      const parent = map.get(node.parent);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node); // orphan
      }
    }
  }
  const sort = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.metadata.sort - b.metadata.sort);
    arr.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}

// ---- main component ----

export function CatalogTree() {
  const [sections, setSections] = useState<SectionRaw[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>({ type: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // force re-render helper
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sections", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SectionRaw[] = await res.json();
      setSections(data);
      // Auto-expand roots
      const rootIds = data.filter((s) => s.parent == null).map((s) => s.id);
      setExpandedIds(new Set(rootIds));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedIds(new Set(sections.map((s) => s.id)));
  const collapseAll = () => setExpandedIds(new Set(sections.filter((s) => s.parent == null).map((s) => s.id)));

  // ---- matching for search ----
  const q = searchQuery.toLowerCase().trim();

  const matchesSearch = (s: SectionRaw): boolean => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.external_id.toLowerCase().includes(q) ||
      String(s.id).includes(q)
    );
  };

  // collect IDs of matching sections and their ancestors
  const getMatchingIds = (): Set<number> => {
    if (!q) return new Set();
    const matched = new Set<number>();
    const idToSection = new Map(sections.map((s) => [s.id, s]));
    for (const s of sections) {
      if (matchesSearch(s)) {
        matched.add(s.id);
        // add ancestors
        let cur: SectionRaw | undefined = s;
        while (cur?.parent != null) {
          matched.add(cur.parent);
          cur = idToSection.get(cur.parent);
        }
      }
    }
    return matched;
  };

  const matchingIds = q ? getMatchingIds() : null;

  // ---- save / delete handlers ----

  const handleSave = async (values: FormValues) => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      let res: Response;
      if (mode.type === "edit") {
        res = await fetch(`/api/admin/sections/${mode.section.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            external_id: values.external_id,
            sort: parseInt(values.sort) || 500,
            picture: values.picture,
            parent: values.parent,
            selected_filters: values.selected_filters,
          }),
        });
      } else {
        res = await fetch("/api/admin/sections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            external_id: values.external_id,
            sort: parseInt(values.sort) || 500,
            picture: values.picture,
            parent: values.parent,
            selected_filters: values.selected_filters,
          }),
        });
      }
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка сохранения");
        return;
      }
      setMode({ type: "idle" });
      await load();
      setSaveSuccess(mode.type === "edit" ? "Изменения сохранены" : "Раздел создан");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Удалить раздел "${name}"?\n\nЭто действие нельзя отменить.`)) return;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);
    try {
      const res = await fetch(`/api/admin/sections/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка удаления");
        return;
      }
      await load();
      setSaveSuccess("Раздел удален");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  // ---- render ----

  const tree = buildTree(sections);

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-6 py-10 text-slate-500">
        <span className="animate-spin text-xl">⟳</span>
        <span>Загрузка структуры каталога…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-slate-300 bg-slate-100 px-6 py-4 text-slate-700">
        Ошибка загрузки: {error}{" "}
        <button onClick={load} className="ml-2 underline hover:no-underline">
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Поиск по названию, slug или ID…"
          className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 transition focus:ring-2"
        />
        <button
          onClick={expandAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Развернуть всё
        </button>
        <button
          onClick={collapseAll}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Свернуть всё
        </button>
        <button
          onClick={() => setMode({ type: "add", parentId: null })}
          className="ml-auto rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Корневой раздел
        </button>
      </div>

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

      {/* inline form for adding root */}
      {mode.type === "add" && mode.parentId === null && (
        <SectionForm
          mode={mode}
          sections={sections}
          saving={saving}
          onSave={handleSave}
          onCancel={() => { setMode({ type: "idle" }); setSaveError(null); setSaveSuccess(null); }}
        />
      )}

      {/* tree */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {tree.length === 0 ? (
          <p className="px-6 py-10 text-sm text-slate-500">Нет разделов</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {tree.map((node) => (
              <TreeNodeRow
                key={node.id}
                node={node}
                depth={0}
                expandedIds={expandedIds}
                onToggle={toggleExpand}
                mode={mode}
                setMode={setMode}
                sections={sections}
                saving={saving}
                saveError={saveError}
                matchingIds={matchingIds}
                searchQuery={q}
                onSave={handleSave}
                onDelete={handleDelete}
                onCancelForm={() => { setMode({ type: "idle" }); setSaveError(null); setSaveSuccess(null); }}
              />
            ))}
          </ul>
        )}
      </div>

      <p className="text-xs text-slate-400">
        Всего разделов: {sections.length}
      </p>
    </div>
  );
}

// ---- TreeNodeRow ----

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  expandedIds: Set<number>;
  onToggle: (id: number) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  sections: SectionRaw[];
  saving: boolean;
  saveError: string | null;
  matchingIds: Set<number> | null;
  searchQuery: string;
  onSave: (v: FormValues) => Promise<void>;
  onDelete: (id: number, name: string) => Promise<void>;
  onCancelForm: () => void;
}

function TreeNodeRow({
  node,
  depth,
  expandedIds,
  onToggle,
  mode,
  setMode,
  sections,
  saving,
  saveError,
  matchingIds,
  searchQuery,
  onSave,
  onDelete,
  onCancelForm,
}: TreeNodeRowProps) {
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = node.children.length > 0;
  const isEditing = mode.type === "edit" && mode.section.id === node.id;
  const isAddingChild = mode.type === "add" && mode.parentId === node.id;

  // search filter
  if (matchingIds && !matchingIds.has(node.id)) return null;

  const highlight = searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase());

  return (
    <>
      <li>
        <div
          className={`flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-2 sm:px-4 ${
            depth === 0 ? "bg-slate-50/60" : ""
          }`}
          style={{ paddingLeft: `${12 + depth * 12}px` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {/* expand toggle */}
            <button
              onClick={() => onToggle(node.id)}
              className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-slate-400 transition hover:text-slate-700 ${
                !hasChildren ? "pointer-events-none opacity-0" : ""
              }`}
              aria-label={isExpanded ? "Свернуть" : "Развернуть"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>

            {/* name */}
            <span
              className={`min-w-0 flex-1 text-sm ${highlight ? "rounded bg-yellow-100 px-1" : ""}`}
            >
              <span
                className={`block truncate font-medium ${
                  depth === 0 ? "text-slate-900" : "text-slate-700"
                }`}
              >
                {node.name}
              </span>
              <span className="mt-0.5 block truncate text-xs text-slate-400 sm:mt-0 sm:inline sm:ml-2">
                /{node.external_id}
                <span className="ml-2 hidden text-slate-300 sm:inline">
                  #{node.id} · sort {node.metadata.sort} · lvl {node.metadata.level}
                </span>
                {hasChildren && (
                  <span className="ml-2 text-slate-400">({node.children.length})</span>
                )}
              </span>
            </span>
          </div>

          {/* actions */}
          <div className="flex flex-shrink-0 flex-wrap items-center gap-1 pl-7 sm:pl-0">
            <button
              onClick={() => setMode({ type: "add", parentId: node.id })}
              title="Добавить дочерний раздел"
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
            >
              + Дочерний
            </button>
            <button
              onClick={() => setMode({ type: "edit", section: node })}
              title="Редактировать"
              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Изменить
            </button>
            <button
              onClick={() => onDelete(node.id, node.name)}
              title="Удалить"
              disabled={hasChildren}
              className="rounded px-2 py-1 text-xs text-black/70 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Удалить
            </button>
          </div>
        </div>

        {/* edit form inline */}
        {isEditing && (
          <div
            style={{ paddingLeft: `${12 + depth * 12 + 20}px` }}
            className="pr-3 pb-3 pt-1 sm:pr-4"
          >
            <SectionForm
              mode={mode}
              sections={sections}
              saving={saving}
              onSave={onSave}
              onCancel={onCancelForm}
            />
          </div>
        )}

        {/* add child form inline */}
        {isAddingChild && (
          <div
            style={{ paddingLeft: `${12 + (depth + 1) * 12 + 20}px` }}
            className="pr-3 pb-3 pt-1 sm:pr-4"
          >
            <SectionForm
              mode={mode}
              sections={sections}
              saving={saving}
              onSave={onSave}
              onCancel={onCancelForm}
            />
          </div>
        )}
      </li>

      {/* children */}
      {isExpanded && node.children.length > 0 && (
        <li>
          <ul>
            {node.children.map((child) => (
              <TreeNodeRow
                key={child.id}
                node={child}
                depth={depth + 1}
                expandedIds={expandedIds}
                onToggle={onToggle}
                mode={mode}
                setMode={setMode}
                sections={sections}
                saving={saving}
                saveError={saveError}
                matchingIds={matchingIds}
                searchQuery={searchQuery}
                onSave={onSave}
                onDelete={onDelete}
                onCancelForm={onCancelForm}
              />
            ))}
          </ul>
        </li>
      )}
    </>
  );
}

// ---- SectionForm ----

interface SectionFormProps {
  mode: Mode;
  sections: SectionRaw[];
  saving: boolean;
  onSave: (v: FormValues) => Promise<void>;
  onCancel: () => void;
}

function SectionForm({ mode, sections, saving, onSave, onCancel }: SectionFormProps) {
  const isEdit = mode.type === "edit";
  const initial: FormValues = isEdit
    ? {
        name: mode.section.name,
        external_id: mode.section.external_id,
        sort: String(mode.section.metadata.sort),
        picture: mode.section.metadata.picture ?? "",
        parent: mode.section.parent,
        selected_filters: mode.section.metadata.selected_filters ?? [],
      }
    : {
        name: "",
        external_id: "",
        sort: "500",
        picture: "",
        parent: mode.type === "add" ? mode.parentId : null,
        selected_filters: [],
      };

  const [values, setValues] = useState<FormValues>(initial);
  const [availableFilters, setAvailableFilters] = useState<SectionFilterOption[]>([]);
  const [filtersLoading, setFiltersLoading] = useState(false);
  const [filtersError, setFiltersError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSectionFilters = async () => {
      if (!isEdit) return;
      setFiltersLoading(true);
      setFiltersError(null);
      try {
        const res = await fetch(`/api/admin/sections/${mode.section.id}/filters`, {
          cache: "no-store",
        });
        const json: { options?: SectionFilterOption[]; selected?: string[]; error?: string } =
          await res.json();
        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setAvailableFilters(Array.isArray(json.options) ? json.options : []);
        setValues((prev) => ({
          ...prev,
          selected_filters: Array.isArray(json.selected)
            ? json.selected.filter((v): v is string => typeof v === "string")
            : prev.selected_filters,
        }));
      } catch (e) {
        if (cancelled) return;
        setFiltersError(e instanceof Error ? e.message : "Ошибка загрузки фильтров");
      } finally {
        if (!cancelled) setFiltersLoading(false);
      }
    };

    loadSectionFilters();
    return () => {
      cancelled = true;
    };
  }, [isEdit, mode]);

  const set = (key: keyof FormValues, value: string | number | null) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSelectedFilter = (key: string) => {
    setValues((prev) => {
      const exists = prev.selected_filters.includes(key);
      return {
        ...prev,
        selected_filters: exists
          ? prev.selected_filters.filter((v) => v !== key)
          : [...prev.selected_filters, key],
      };
    });
  };

  const selectAllFilters = () => {
    setValues((prev) => ({
      ...prev,
      selected_filters: availableFilters.map((f) => f.key),
    }));
  };

  const clearAllFilters = () => {
    setValues((prev) => ({ ...prev, selected_filters: [] }));
  };

  const handleNameChange = (v: string) => {
    set("name", v);
    if (!isEdit) set("external_id", slugify(v));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave(values);
  };

  // build parent options (all sections except self and descendants when editing)
  const forbiddenIds: Set<number> = new Set();
  if (isEdit) {
    const collectDescendants = (id: number) => {
      forbiddenIds.add(id);
      sections.filter((s) => s.parent === id).forEach((s) => collectDescendants(s.id));
    };
    collectDescendants(mode.section.id);
  }

  const parentOptions = sections.filter((s) => !forbiddenIds.has(s.id));

  // indent label for parent select
  const getIndent = (s: SectionRaw) => "—".repeat((s.metadata.level ?? 1) - 1) + " ";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-blue-800">
        {isEdit ? `Редактировать: ${mode.section.name}` : "Новый раздел"}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* Name */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Название *</label>
          <input
            ref={nameRef}
            required
            value={values.name}
            onChange={(e) => handleNameChange(e.target.value)}
            placeholder="Название раздела"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 focus:ring-2"
          />
        </div>

        {/* Slug */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Slug (external_id) *</label>
          <input
            required
            value={values.external_id}
            onChange={(e) => set("external_id", e.target.value)}
            placeholder="moy-razdel"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm font-mono outline-none ring-blue-400 focus:ring-2"
          />
        </div>

        {/* Sort */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Сортировка</label>
          <input
            type="number"
            value={values.sort}
            onChange={(e) => set("sort", e.target.value)}
            min={0}
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 focus:ring-2"
          />
        </div>

        {/* Parent */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-slate-600">Родительский раздел</label>
          <select
            value={values.parent ?? ""}
            onChange={(e) =>
              set("parent", e.target.value === "" ? null : parseInt(e.target.value))
            }
            className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none ring-blue-400 focus:ring-2"
          >
            <option value="">— Корневой раздел —</option>
            {parentOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {getIndent(s)}{s.name} (#{s.id})
              </option>
            ))}
          </select>
        </div>

        {/* Picture URL */}
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-xs font-medium text-slate-600">URL изображения</label>
          <input
            type="url"
            value={values.picture}
            onChange={(e) => set("picture", e.target.value)}
            placeholder="https://example.com/image.webp"
            className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none ring-blue-400 focus:ring-2"
          />
        </div>

        {isEdit && (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <label className="text-xs font-medium text-slate-600">
              Доступные фильтры категории
            </label>

            <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              {filtersLoading ? (
                <p className="text-slate-500">Загрузка фильтров…</p>
              ) : filtersError ? (
                <p className="text-slate-600">Не удалось загрузить: {filtersError}</p>
              ) : availableFilters.length === 0 ? (
                <p className="text-slate-500">Для этого раздела фильтры не найдены.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      Выбрано: {values.selected_filters.filter((key) =>
                        availableFilters.some((f) => f.key === key)
                      ).length} из {availableFilters.length}
                    </p>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={selectAllFilters}
                        className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                      >
                        Отметить все
                      </button>
                      <button
                        type="button"
                        onClick={clearAllFilters}
                        className="rounded border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                      >
                        Снять все
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {availableFilters.map((filter) => (
                      <label
                        key={filter.key}
                        className="flex items-start gap-2 rounded px-1 py-0.5 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={values.selected_filters.includes(filter.key)}
                          onChange={() => toggleSelectedFilter(filter.key)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                        />
                        <span className="leading-tight text-slate-700">
                          {filter.label}
                          {typeof filter.count === "number" ? (
                            <span className="ml-1 text-xs text-slate-400">
                              ({filter.count})
                            </span>
                          ) : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm hover:bg-white"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

