"use client";

import { useEffect, useState } from "react";
import type { ContentBlock } from "@/lib/types";

const CONTENT_KEYS = [
  { key: "hero", label: "Основной баннер" },
  { key: "about", label: "О компании" },
  { key: "contacts", label: "Контакты" },
] as const;

export function ContentManager() {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [formData, setFormData] = useState({ title: "", content: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContent();
  }, []);

  async function fetchContent() {
    try {
      const res = await fetch("/api/admin/content");
      if (!res.ok) throw new Error("Failed to fetch content");
      const data = await res.json();
      setBlocks(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch content");
    } finally {
      setLoading(false);
    }
  }

  function handleEdit(block: ContentBlock) {
    setEditing(block.key);
    setFormData({ title: block.title, content: block.content });
  }

  async function handleSave() {
    if (!editing || !formData.title || !formData.content) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/content/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!res.ok) throw new Error("Failed to save content");

      const updated = await res.json();
      setBlocks(blocks.map((b) => (b.key === updated.key ? updated : b)));
      setEditing(null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save content");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-center text-slate-600">Загрузка...</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-red-800">{error}</div>
      )}

      <div className="grid gap-4">
        {CONTENT_KEYS.map((item) => {
          const block = blocks.find((b) => b.key === item.key);
          if (!block) return null;

          const isEditing = editing === block.key;

          return (
            <div
              key={block.key}
              className="rounded-lg border border-slate-200 bg-white p-6"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900">
                  {item.label}
                </h3>
                <div className="text-xs text-slate-500">
                  Обновлено:{" "}
                  {new Date(block.updatedAt).toLocaleDateString("ru-RU")}
                </div>
              </div>

              {isEditing ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Заголовок
                    </label>
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                      placeholder="Введите заголовок"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700">
                      Содержание
                    </label>
                    <textarea
                      value={formData.content}
                      onChange={(e) =>
                        setFormData({ ...formData, content: e.target.value })
                      }
                      rows={6}
                      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                      placeholder="Введите содержание"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-400"
                    >
                      {saving ? "Сохранение..." : "Сохранить"}
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      disabled={saving}
                      className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 disabled:bg-slate-100"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Заголовок:
                    </p>
                    <p className="mt-1 text-slate-900">{block.title}</p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-600">
                      Содержание:
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-slate-900">
                      {block.content}
                    </p>
                  </div>

                  <button
                    onClick={() => handleEdit(block)}
                    className="mt-4 rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
                  >
                    Редактировать
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
