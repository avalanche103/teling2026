"use client";

import { useCallback, useEffect, useState } from "react";

type StaffRole = "admin" | "employee" | "operator";

interface Employee {
  id: string;
  username: string;
  name: string;
  role: StaffRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DraftEmployee {
  username: string;
  name: string;
  role: StaffRole;
  password: string;
}

const ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Администратор",
  employee: "Сотрудник",
  operator: "Оператор",
};

export function StaffManager() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftEmployee>>({});
  const [createDraft, setCreateDraft] = useState<DraftEmployee>({
    username: "",
    name: "",
    role: "operator",
    password: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/employees", { cache: "no-store" });
      const data = (await res.json()) as Employee[] | { error?: string };
      if (!res.ok || !Array.isArray(data)) {
        throw new Error(Array.isArray(data) ? "Не удалось загрузить сотрудников" : data.error || "Не удалось загрузить сотрудников");
      }
      setEmployees(data);
      setDrafts(
        Object.fromEntries(
          data.map((employee) => [
            employee.id,
            {
              username: employee.username,
              name: employee.name,
              role: employee.role,
              password: "",
            },
          ])
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сотрудников");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateDraft(id: string, patch: Partial<DraftEmployee>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function saveEmployee(id: string, active: boolean) {
    const draft = drafts[id];
    if (!draft) return;
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: draft.username,
          name: draft.name,
          role: draft.role,
          password: draft.password || undefined,
          active,
        }),
      });
      const data = (await res.json()) as Employee | { error?: string };
      if (!res.ok || Array.isArray(data) || !("id" in data)) {
        throw new Error("error" in data ? data.error : "Не удалось сохранить сотрудника");
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить сотрудника");
    } finally {
      setSavingId(null);
    }
  }

  async function createNewEmployee(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreatePending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createDraft),
      });
      const data = (await res.json()) as Employee | { error?: string };
      if (!res.ok || !("id" in data)) {
        throw new Error("error" in data ? data.error : "Не удалось создать сотрудника");
      }
      setCreateDraft({ username: "", name: "", role: "operator", password: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать сотрудника");
    } finally {
      setCreatePending(false);
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createNewEmployee} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Новый сотрудник</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input
            value={createDraft.name}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, name: e.target.value }))}
            placeholder="Имя"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <input
            value={createDraft.username}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, username: e.target.value }))}
            placeholder="Логин"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={createDraft.role}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, role: e.target.value as StaffRole }))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            {Object.entries(ROLE_LABELS).map(([role, label]) => (
              <option key={role} value={role}>{label}</option>
            ))}
          </select>
          <input
            type="password"
            value={createDraft.password}
            onChange={(e) => setCreateDraft((prev) => ({ ...prev, password: e.target.value }))}
            placeholder="Пароль"
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={createPending}
          className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Добавить сотрудника
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Сотрудники</h2>
        </div>
        {error && <p className="px-5 pt-4 text-sm text-red-600">{error}</p>}
        {loading ? (
          <p className="px-5 py-6 text-sm text-slate-500">Загрузка…</p>
        ) : (
          <div className="space-y-4 p-5">
            {employees.map((employee) => {
              const draft = drafts[employee.id];
              return (
                <div key={employee.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_0.9fr_0.8fr_auto] md:items-center">
                    <input
                      value={draft?.name ?? ""}
                      onChange={(e) => updateDraft(employee.id, { name: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={draft?.username ?? ""}
                      onChange={(e) => updateDraft(employee.id, { username: e.target.value })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <select
                      value={draft?.role ?? employee.role}
                      onChange={(e) => updateDraft(employee.id, { role: e.target.value as StaffRole })}
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    >
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                        <option key={role} value={role}>{label}</option>
                      ))}
                    </select>
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input
                        type="checkbox"
                        checked={employee.active}
                        onChange={() => saveEmployee(employee.id, !employee.active)}
                      />
                      Активен
                    </label>
                    <button
                      onClick={() => saveEmployee(employee.id, employee.active)}
                      disabled={savingId === employee.id}
                      className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      Сохранить
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                    <input
                      type="password"
                      value={draft?.password ?? ""}
                      onChange={(e) => updateDraft(employee.id, { password: e.target.value })}
                      placeholder="Новый пароль, если нужно сменить"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-slate-400">
                      Обновлен: {new Date(employee.updatedAt).toLocaleString("ru-RU")}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}