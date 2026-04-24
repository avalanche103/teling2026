"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Message {
  id: string;
  role: "visitor" | "support";
  text: string;
  createdAt: string;
}

interface Chat {
  id: string;
  visitorId: string;
  createdAt: string;
  updatedAt: string;
  blocked: boolean;
  visitorInfo: {
    userAgent?: string;
    ip?: string;
    language?: string;
    locale?: string;
    timeZone?: string;
    platform?: string;
    deviceType?: "desktop" | "mobile" | "tablet" | "unknown";
    viewport?: string;
    screen?: string;
    colorScheme?: "light" | "dark" | "no-preference";
    referrer?: string;
    phone?: string;
    email?: string;
    organization?: string;
    firstSeenAt?: string;
  };
  messages: Message[];
}

type ContactField = "phone" | "email" | "organization";

const CONTACT_LABELS: Record<ContactField, string> = {
  phone: "Телефон",
  email: "Email",
  organization: "Организация",
};

// ── localStorage helpers ────────────────────────────────────────────────────
const SEEN_KEY = "admin_chat_seen"; // { [chatId]: messageCount }

function getSeenCounts(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function markSeen(chatId: string, count: number) {
  const seen = getSeenCounts();
  seen[chatId] = count;
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
}

function isUnread(chat: Chat): boolean {
  const lastMsg = chat.messages[chat.messages.length - 1];
  if (!lastMsg || lastMsg.role !== "visitor") return false;
  const seenCount = getSeenCounts()[chat.id] ?? 0;
  return chat.messages.length > seenCount;
}

// ── Browser Notification helpers ────────────────────────────────────────────
function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // ignore (secure context / user denied)
  }
}

// ───────────────────────────────────────────────────────────────────────────

export function AdminChatPanel() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
    const [blockingId, setBlockingId] = useState<string | null>(null);
  const prevCountsRef = useRef<Record<string, number>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchChats = useCallback(
    async (isFirstFetch = false) => {
      try {
        const res = await fetch("/api/admin/chats");
        if (!res.ok) return;
        const data: Chat[] = await res.json();

        // Detect new visitor messages → browser notification
        if (!isFirstFetch) {
          data.forEach((chat) => {
            const prevCount = prevCountsRef.current[chat.id] ?? 0;
            if (chat.messages.length > prevCount) {
              const newMsgs = chat.messages.slice(prevCount);
              const hasNewVisitor = newMsgs.some((m) => m.role === "visitor");
              if (hasNewVisitor && chat.id !== selectedId) {
                const lastText =
                  newMsgs.filter((m) => m.role === "visitor").pop()?.text ?? "";
                sendBrowserNotification(
                  "Новое сообщение в чате",
                  lastText.length > 80 ? lastText.slice(0, 80) + "…" : lastText
                );
              }
            }
          });
        }

        data.forEach((chat) => {
          prevCountsRef.current[chat.id] = chat.messages.length;
        });

        setChats(data);
      } catch {
        // ignore
      }
    },
    [selectedId]
  );

  // Heartbeat — mark operator as online while admin panel is open
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function ping() {
      fetch("/api/admin/heartbeat", { method: "POST" }).catch(() => {});
    }
    ping(); // immediate ping on mount
    heartbeatRef.current = setInterval(ping, 30_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  useEffect(() => {
    requestNotificationPermission();
    fetchChats(true);
    pollRef.current = setInterval(() => fetchChats(false), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchChats]);

  // Mark selected chat as read whenever it's open or new messages arrive
  useEffect(() => {
    if (!selectedId) return;
    const chat = chats.find((c) => c.id === selectedId);
    if (chat) markSeen(selectedId, chat.messages.length);
  }, [selectedId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, chats]);

  const selected = chats.find((c) => c.id === selectedId);

  async function sendReply() {
    if (!replyText.trim() || !selectedId || sending) return;
    setSending(true);
    const text = replyText.trim();
    setReplyText("");
    try {
      const res = await fetch(`/api/admin/chats/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (res.ok) {
        await fetchChats(false);
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function sendContactRequest(field: ContactField) {
    if (!selectedId || sending) return;
    setSending(true);
    const labels: Record<ContactField, string> = {
      phone: "пожалуйста, укажите ваш телефон",
      email: "пожалуйста, укажите ваш email",
      organization: "пожалуйста, укажите название вашей организации",
    };
    try {
      const res = await fetch(`/api/admin/chats/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: labels[field], type: "contact_request", field }),
      });
      if (res.ok) await fetchChats(false);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function toggleBlock(chatId: string, blocked: boolean) {
    setBlockingId(chatId);
    try {
      const res = await fetch(`/api/admin/chats/${chatId}/block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocked }),
      });
      if (res.ok) await fetchChats(false);
    } catch {
      // ignore
    } finally {
      setBlockingId(null);
    }
  }

  const totalUnread = chats.filter(isUnread).length;

  return (
    <div className="flex h-[calc(100vh-10rem)] gap-4">
      {/* Sidebar: list of chats */}
      <aside className="flex w-72 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Диалоги ({chats.length})</h2>
          {totalUnread > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
              {totalUnread} новых
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Нет диалогов</p>
          )}
          {chats.map((chat) => {
            const lastMsg = chat.messages[chat.messages.length - 1];
            const unread = isUnread(chat);
            const isSelected = selectedId === chat.id;
            return (
              <button
                key={chat.id}
                onClick={() => setSelectedId(chat.id)}
                className={`w-full border-b border-slate-50 px-4 py-3 text-left transition-colors hover:bg-blue-50 ${
                  isSelected ? "bg-blue-50" : unread ? "bg-red-50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-mono text-slate-400">
                    {chat.visitorId.slice(0, 8)}…
                  </span>
                  {unread && !isSelected && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                </div>
                {lastMsg && (
                  <p className={`mt-0.5 truncate text-sm ${
                    unread && !isSelected ? "font-semibold text-slate-800" : "text-slate-600"
                  }`}>
                    {lastMsg.role === "support" ? "↩ " : ""}
                    {lastMsg.text}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-slate-400">
                  {formatTime(chat.updatedAt)}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Main: conversation */}
      <div className="flex flex-1 gap-3 overflow-hidden">
      {/* Conversation column */}
      <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            Выберите диалог
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  Диалог с посетителем
                  {selected.blocked && (
                    <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                      Заблокирован
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-400">ID: {selected.visitorId}</p>
              </div>
              <button
                onClick={() => toggleBlock(selected.id, !selected.blocked)}
                disabled={blockingId === selected.id}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 ${
                  selected.blocked
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-red-100 text-red-700 hover:bg-red-200"
                }`}
              >
                {selected.blocked ? "Разблокировать" : "Заблокировать"}
              </button>
            </div>

            {/* Messages */}
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
              {selected.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "support" ? "justify-end" : "justify-start"
                  }`}
                >
                  {(msg as Message & { type?: string }).type === "contact_request" ? (
                    <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                      📋 Запрос: {msg.text}
                    </div>
                  ) : (
                    <div
                      className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                        msg.role === "support"
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-slate-100 text-slate-800 rounded-bl-sm"
                      }`}
                    >
                      <p>{msg.text}</p>
                      <p
                        className={`mt-1 text-right text-xs ${
                          msg.role === "support" ? "text-blue-200" : "text-slate-400"
                        }`}
                      >
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-slate-100 p-4">
                            {/* Contact request buttons */}
                            <div className="mb-3 flex flex-wrap gap-2">
                              {(["phone", "email", "organization"] as ContactField[]).map((f) => (
                                <button
                                  key={f}
                                  onClick={() => sendContactRequest(f)}
                                  disabled={sending}
                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                                >
                                  Запросить: {CONTACT_LABELS[f]}
                                </button>
                              ))}
                            </div>
              <div className="flex items-end gap-3">
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Ответ посетителю…"
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white transition-colors"
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  Ответить
                </button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Enter — отправить · Shift+Enter — новая строка
              </p>
            </div>
          </>
        )}
      </div>
        </div>

        {/* Visitor info sidebar */}
        {selected && (
          <aside className="flex w-56 flex-col rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Данные посетителя
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 text-xs">
              {selected.visitorInfo?.ip && (
                <div>
                  <p className="text-slate-400">IP-адрес</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.ip}</p>
                </div>
              )}
              {selected.visitorInfo?.firstSeenAt && (
                <div>
                  <p className="text-slate-400">Первое обращение</p>
                  <p className="font-medium text-slate-700">{formatTime(selected.visitorInfo.firstSeenAt)}</p>
                </div>
              )}
              {selected.visitorInfo?.phone && (
                <div>
                  <p className="text-slate-400">Телефон</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.phone}</p>
                </div>
              )}
              {selected.visitorInfo?.email && (
                <div>
                  <p className="text-slate-400">Email</p>
                  <p className="font-medium text-slate-700 break-all">{selected.visitorInfo.email}</p>
                </div>
              )}
              {selected.visitorInfo?.organization && (
                <div>
                  <p className="text-slate-400">Организация</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.organization}</p>
                </div>
              )}
              {selected.visitorInfo?.userAgent && (
                <div>
                  <p className="text-slate-400">Браузер</p>
                  <p className="text-slate-600 break-all leading-tight">{selected.visitorInfo.userAgent}</p>
                </div>
              )}
              {selected.visitorInfo?.deviceType && (
                <div>
                  <p className="text-slate-400">Устройство</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.deviceType}</p>
                </div>
              )}
              {selected.visitorInfo?.platform && (
                <div>
                  <p className="text-slate-400">Платформа</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.platform}</p>
                </div>
              )}
              {selected.visitorInfo?.timeZone && (
                <div>
                  <p className="text-slate-400">Место (часовой пояс)</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.timeZone}</p>
                </div>
              )}
              {selected.visitorInfo?.locale && (
                <div>
                  <p className="text-slate-400">Локаль</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.locale}</p>
                </div>
              )}
              {selected.visitorInfo?.language && (
                <div>
                  <p className="text-slate-400">Язык браузера</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.language}</p>
                </div>
              )}
              {selected.visitorInfo?.viewport && (
                <div>
                  <p className="text-slate-400">Viewport</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.viewport}</p>
                </div>
              )}
              {selected.visitorInfo?.screen && (
                <div>
                  <p className="text-slate-400">Экран</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.screen}</p>
                </div>
              )}
              {selected.visitorInfo?.colorScheme && (
                <div>
                  <p className="text-slate-400">Тема</p>
                  <p className="font-medium text-slate-700">{selected.visitorInfo.colorScheme}</p>
                </div>
              )}
              {selected.visitorInfo?.referrer && (
                <div>
                  <p className="text-slate-400">Referrer</p>
                  <p className="text-slate-600 break-all leading-tight">{selected.visitorInfo.referrer}</p>
                </div>
              )}
              {!selected.visitorInfo?.phone && !selected.visitorInfo?.email && !selected.visitorInfo?.organization && !selected.visitorInfo?.ip && !selected.visitorInfo?.timeZone && !selected.visitorInfo?.deviceType && (
                <p className="text-slate-400">Нет данных</p>
              )}
            </div>
          </aside>
        )}
    </div>
  );
}
