"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { SectionRaw } from "@/lib/types";

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
  const [searchQuery, setSearchQuery] = useState("");

  // force re-render helper
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sections");
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
    try {
      const res = await fetch(`/api/admin/sections/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        setSaveError(json.error ?? "Ошибка удаления");
        return;
      }
      await load();
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
          onCancel={() => { setMode({ type: "idle" }); setSaveError(null); }}
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
                onCancelForm={() => { setMode({ type: "idle" }); setSaveError(null); }}
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
          className={`flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50 transition-colors ${
            depth === 0 ? "bg-slate-50/60" : ""
          }`}
          style={{ paddingLeft: `${16 + depth * 20}px` }}
        >
          {/* expand toggle */}
          <button
            onClick={() => onToggle(node.id)}
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-slate-400 transition hover:text-slate-700 ${
              !hasChildren ? "opacity-0 pointer-events-none" : ""
            }`}
            aria-label={isExpanded ? "Свернуть" : "Развернуть"}
          >
            {isExpanded ? "▾" : "▸"}
          </button>

          {/* name */}
          <span className={`flex-1 text-sm ${highlight ? "bg-yellow-100 rounded px-1" : ""}`}>
            <span className={`font-medium ${depth === 0 ? "text-slate-900" : "text-slate-700"}`}>
              {node.name}
            </span>
            <span className="ml-2 text-xs text-slate-400">
              /{node.external_id}
            </span>
            <span className="ml-2 text-xs text-slate-300">
              #{node.id} · sort {node.metadata.sort} · lvl {node.metadata.level}
            </span>
            {hasChildren && (
              <span className="ml-2 text-xs text-slate-400">
                ({node.children.length})
              </span>
            )}
          </span>

          {/* actions */}
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              onClick={() =>
                setMode({ type: "add", parentId: node.id })
              }
              title="Добавить дочерний раздел"
              className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
            >
              + Дочерний
            </button>
            <button
              onClick={() =>
                setMode({ type: "edit", section: node })
              }
              title="Редактировать"
              className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
            >
              Изменить
            </button>
            <button
              onClick={() => onDelete(node.id, node.name)}
              title="Удалить"
              disabled={hasChildren}
              className="rounded px-2 py-1 text-xs text-red-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Удалить
            </button>
          </div>
        </div>

        {/* edit form inline */}
        {isEditing && (
          <div style={{ paddingLeft: `${16 + depth * 20 + 24}px` }} className="pr-4 pb-3 pt-1">
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
          <div style={{ paddingLeft: `${16 + (depth + 1) * 20 + 24}px` }} className="pr-4 pb-3 pt-1">
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
      }
    : {
        name: "",
        external_id: "",
        sort: "500",
        picture: "",
        parent: mode.type === "add" ? mode.parentId : null,
      };

  const [values, setValues] = useState<FormValues>(initial);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const set = (key: keyof FormValues, value: string | number | null) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const slugify = (s: string) =>
    s
      .toLowerCase()
      .replace(/[а-яё]/g, (c) => translitMap[c] ?? c)
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-");

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

// ---- transliteration map (basic RU → EN for slug generation) ----

const translitMap: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
  ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
  ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};
