"use client";

import { useEffect, useState, useCallback } from "react";
import { ImportHistoryEntry } from "@/lib/types";

export function ImportHistory() {
  const [history, setHistory] = useState<ImportHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products/import/history");
      if (!res.ok) throw new Error("Не удалось загрузить историю");
      const data = (await res.json()) as ImportHistoryEntry[];
      setHistory(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ошибка при загрузке истории";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  if (loading && history.length === 0) {
    return <div className="text-gray-500 text-sm">Загрузка истории...</div>;
  }

  if (error) {
    return (
      <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
        {error}
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-gray-500 text-sm">
        История импортов пуста.
      </div>
    );
  }

  return (
    <div className="mt-6 border-t pt-6">
      <h3 className="text-lg font-semibold mb-4">📋 История импортов</h3>
      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b">
              <th className="px-4 py-2 text-left font-semibold">Дата и время</th>
              <th className="px-4 py-2 text-left font-semibold">Имя файла</th>
              <th className="px-4 py-2 text-center font-semibold">Добавлено</th>
              <th className="px-4 py-2 text-center font-semibold">Обновлено</th>
              <th className="px-4 py-2 text-center font-semibold">Скрыто</th>
              <th className="px-4 py-2 text-center font-semibold">Удалено</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry, index) => {
              const date = new Date(entry.timestamp);
              const dateStr = date.toLocaleDateString("ru-RU", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
              });
              const timeStr = date.toLocaleTimeString("ru-RU", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              });

              return (
                <tr
                  key={entry.id}
                  className={index % 2 === 0 ? "bg-white" : "bg-gray-50"}
                >
                  <td className="px-4 py-2 text-gray-700">
                    {dateStr} {timeStr}
                  </td>
                  <td className="px-4 py-2 text-gray-600 font-mono text-xs">
                    {entry.filename}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                      +{entry.addedCount}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                      ↻ {entry.updatedCount}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block bg-yellow-100 text-yellow-700 px-2 py-1 rounded text-xs font-medium">
                      {entry.hiddenCount}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-block bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-medium">
                      −{entry.deletedCount}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-500 mt-2">
        Показаны последние {history.length} импортов (максимум 100)
      </p>
    </div>
  );
}
