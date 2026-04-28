"use client";

import { useEffect, useState } from "react";
import type { ContactPhone, ContactsContent, ContentBlock } from "@/lib/types";

function getReadableBadgeTextColor(color?: string): string {
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return "#ffffff";
  }

  const r = Number.parseInt(color.slice(1, 3), 16);
  const g = Number.parseInt(color.slice(3, 5), 16);
  const b = Number.parseInt(color.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#111827" : "#ffffff";
}

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
  const [contactsForm, setContactsForm] = useState<ContactsContent>({
    address: "",
    phones: [],
    email: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildContactsText(data: ContactsContent): string {
    const phonesLines = data.phones.map((phone) => phone.value).join("\n");
    return [data.address, phonesLines, data.email].filter(Boolean).join("\n\n");
  }

  function getDefaultContacts(block: ContentBlock): ContactsContent {
    if (block.contacts) {
      return block.contacts;
    }

    return {
      address: block.content,
      phones: [],
      email: "",
    };
  }

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
    if (block.key === "contacts") {
      setContactsForm(getDefaultContacts(block));
    }
  }

  async function handleSave() {
    if (!editing || !formData.title) return;

    const payload = {
      title: formData.title,
      content:
        editing === "contacts"
          ? buildContactsText(contactsForm)
          : formData.content,
      contacts: editing === "contacts" ? contactsForm : undefined,
    };

    if (!payload.content) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/content/${editing}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

                  {block.key === "contacts" ? (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Адрес
                        </label>
                        <input
                          type="text"
                          value={contactsForm.address}
                          onChange={(e) =>
                            setContactsForm({ ...contactsForm, address: e.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                          placeholder="Введите адрес"
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="block text-sm font-medium text-slate-700">
                            Телефоны
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setContactsForm({
                                ...contactsForm,
                                phones: [...contactsForm.phones, { value: "", href: "", badge: "", badgeColor: "#dc2626" }],
                              })
                            }
                            className="rounded-md bg-slate-200 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-300"
                          >
                            Добавить телефон
                          </button>
                        </div>
                        {contactsForm.phones.map((phone, index) => (
                          <div key={`${phone.value}-${index}`} className="grid gap-2 rounded-md border border-slate-200 p-3 md:grid-cols-[1fr_1fr_auto]">
                            <input
                              type="text"
                              value={phone.value}
                              onChange={(e) => {
                                const phones = [...contactsForm.phones];
                                phones[index] = { ...phones[index], value: e.target.value };
                                setContactsForm({ ...contactsForm, phones });
                              }}
                              className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                              placeholder="Телефон"
                            />
                            <input
                              type="text"
                              value={phone.badge || ""}
                              onChange={(e) => {
                                const phones = [...contactsForm.phones];
                                phones[index] = { ...phones[index], badge: e.target.value };
                                setContactsForm({ ...contactsForm, phones });
                              }}
                              className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                              placeholder="Бейдж (A1, МТС...)"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const phones = contactsForm.phones.filter((_, i) => i !== index);
                                setContactsForm({ ...contactsForm, phones });
                              }}
                              className="rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                            >
                              Удалить
                            </button>
                            <input
                              type="text"
                              value={phone.href}
                              onChange={(e) => {
                                const phones = [...contactsForm.phones];
                                phones[index] = { ...phones[index], href: e.target.value };
                                setContactsForm({ ...contactsForm, phones });
                              }}
                              className="md:col-span-3 rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                              placeholder="Ссылка tel:..."
                            />
                            <div className="md:col-span-3 flex flex-wrap items-center gap-3">
                              <label className="text-sm text-slate-700">Цвет бейджа:</label>
                              <input
                                type="color"
                                value={phone.badgeColor || "#dc2626"}
                                onChange={(e) => {
                                  const phones = [...contactsForm.phones];
                                  phones[index] = { ...phones[index], badgeColor: e.target.value };
                                  setContactsForm({ ...contactsForm, phones });
                                }}
                                className="h-9 w-14 cursor-pointer rounded border border-slate-300 bg-white p-1"
                              />
                              <input
                                type="text"
                                value={phone.badgeColor || ""}
                                onChange={(e) => {
                                  const phones = [...contactsForm.phones];
                                  phones[index] = { ...phones[index], badgeColor: e.target.value };
                                  setContactsForm({ ...contactsForm, phones });
                                }}
                                className="w-32 rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                                placeholder="#dc2626"
                              />
                              {phone.badge ? (
                                <span
                                  className="inline-flex h-5 min-w-7 items-center justify-center rounded px-1.5 text-[10px] font-extrabold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: phone.badgeColor || "#dc2626",
                                    color: getReadableBadgeTextColor(phone.badgeColor || "#dc2626"),
                                  }}
                                >
                                  {phone.badge}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700">
                          Email
                        </label>
                        <input
                          type="email"
                          value={contactsForm.email}
                          onChange={(e) =>
                            setContactsForm({ ...contactsForm, email: e.target.value })
                          }
                          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none"
                          placeholder="info@teling.by"
                        />
                      </div>
                    </>
                  ) : (
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
                  )}

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

                  {block.key === "contacts" ? (
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-slate-600">Адрес:</p>
                        <p className="mt-1 text-slate-900">{block.contacts?.address || block.content}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600">Телефоны:</p>
                        <div className="mt-1 space-y-1">
                          {(block.contacts?.phones || []).map((phone: ContactPhone, index: number) => (
                            <div key={`${phone.value}-${index}`} className="flex items-center gap-2 text-slate-900">
                              <span className="flex-1">{phone.value}</span>
                              {phone.badge ? (
                                <span
                                  className="inline-flex h-5 min-w-7 shrink-0 items-center justify-center rounded px-1.5 text-[10px] font-extrabold uppercase tracking-wide"
                                  style={{
                                    backgroundColor: phone.badgeColor || "#dc2626",
                                    color: getReadableBadgeTextColor(phone.badgeColor || "#dc2626"),
                                  }}
                                >
                                  {phone.badge}
                                </span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-600">Email:</p>
                        <p className="mt-1 text-slate-900">{block.contacts?.email}</p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium text-slate-600">
                        Содержание:
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-slate-900">
                        {block.content}
                      </p>
                    </div>
                  )}

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
