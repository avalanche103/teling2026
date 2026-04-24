"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Message {
  id: string;
  role: "visitor" | "support";
  text: string;
  createdAt: string;
}

type ContactField = "phone" | "email" | "organization";

interface VisitorInfoPayload {
  language?: string;
  locale?: string;
  timeZone?: string;
  platform?: string;
  deviceType?: "desktop" | "mobile" | "tablet" | "unknown";
  viewport?: string;
  screen?: string;
  colorScheme?: "light" | "dark" | "no-preference";
  referrer?: string;
}

interface MessageExt {
  id: string;
  role: "visitor" | "support";
  type?: "text" | "contact_request" | "contact_response";
  field?: ContactField;
  text: string;
  createdAt: string;
}

const CONTACT_FIELD_LABELS: Record<ContactField, string> = {
  phone: "Телефон",
  email: "Email",
  organization: "Название организации",
};

function getOrCreateVisitorId(): string {
  let id = localStorage.getItem("chat_visitor_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("chat_visitor_id", id);
  }
  return id;
}

function detectDeviceType(userAgent: string): "desktop" | "mobile" | "tablet" | "unknown" {
  const ua = userAgent.toLowerCase();
  if (!ua) return "unknown";
  if (/(ipad|tablet|playbook|silk)|(android(?!.*mobile))/i.test(ua)) return "tablet";
  if (/mobi|iphone|ipod|android.*mobile|windows phone/i.test(ua)) return "mobile";
  return "desktop";
}

function collectVisitorInfo(): VisitorInfoPayload {
  if (typeof window === "undefined") return {};
  const locale = navigator.languages?.[0] ?? navigator.language;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const colorScheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "no-preference";

  return {
    language: navigator.language,
    locale,
    timeZone,
    platform: navigator.platform,
    deviceType: detectDeviceType(navigator.userAgent),
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    screen: `${window.screen.width}x${window.screen.height}`,
    colorScheme,
    referrer: document.referrer || undefined,
  };
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MessageExt[]>([]);
  const [inputText, setInputText] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [operatorOnline, setOperatorOnline] = useState<boolean | null>(null);
    const [blocked, setBlocked] = useState(false);
    const [respondedFields, setRespondedFields] = useState<Set<string>>(new Set());
    const [contactInputs, setContactInputs] = useState<Record<string, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Restore chatId from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("chat_id");
    if (stored) setChatId(stored);
  }, []);

  // Poll operator online status
  useEffect(() => {
    async function fetchStatus() {
      try {
        const res = await fetch("/api/chat/operator-status");
        if (res.ok) {
          const data = await res.json();
          setOperatorOnline(data.online);
        }
      } catch {
        // ignore
      }
    }
    fetchStatus();
    statusPollRef.current = setInterval(fetchStatus, 30_000);
    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current);
    };
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const fetchMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat?chatId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
        if (data.blocked) setBlocked(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Poll for new messages when chat is open and chatId exists
  useEffect(() => {
    if (open && chatId) {
      fetchMessages(chatId);
      pollRef.current = setInterval(() => fetchMessages(chatId), 5000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [open, chatId, fetchMessages]);

  async function sendMessage() {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    setInputText("");

    const visitorId = getOrCreateVisitorId();
    const visitorInfo = collectVisitorInfo();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId, chatId, text, type: "text", visitorInfo }),
      });
      if (res.ok) {
        const data = await res.json();
        setChatId(data.chatId);
        localStorage.setItem("chat_id", data.chatId);
        setMessages(data.messages ?? []);
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
      sendMessage();
    }
  }

  async function sendContactResponse(msgId: string, field: ContactField) {
    const value = (contactInputs[msgId] ?? "").trim();
    if (!value || sending) return;
    setSending(true);
    setRespondedFields((prev) => new Set(prev).add(msgId));
    const visitorId = getOrCreateVisitorId();
    const visitorInfo = collectVisitorInfo();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          chatId,
          text: value,
          type: "contact_response",
          field,
          visitorInfo,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch {
      setRespondedFields((prev) => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Chat window */}
      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-80 flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6 sm:w-96">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-2xl bg-blue-600 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Свяжитесь с нами</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${
                    operatorOnline === true
                      ? "bg-green-400"
                      : operatorOnline === false
                      ? "bg-red-400"
                      : "bg-slate-400"
                  }`}
                />
                <span className="text-xs text-blue-100">
                  {operatorOnline === true
                    ? "Оператор онлайн"
                    : operatorOnline === false
                    ? "Оператор офлайн"
                    : "Проверяем статус…"}
                </span>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="flex h-7 w-7 items-center justify-center rounded-full text-white hover:bg-blue-500 transition-colors"
              aria-label="Закрыть чат"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 min-h-[220px] max-h-72">
            {blocked && (
              <p className="m-auto text-center text-sm text-red-500">
                Вы заблокированы и не можете отправлять сообщения.
              </p>
            )}
            {!blocked && messages.length === 0 && (
              <p className="m-auto text-center text-sm text-slate-400">
                Напишите ваш вопрос, и мы постараемся помочь.
              </p>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "visitor" ? "justify-end" : "justify-start"}`}
              >
                {msg.type === "contact_request" && msg.field ? (
                  <div className="w-full rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm">
                    <p className="font-medium text-blue-700">
                      Пожалуйста, укажите: {CONTACT_FIELD_LABELS[msg.field]}
                    </p>
                    {respondedFields.has(msg.id) ? (
                      <p className="mt-1 text-xs text-slate-500">Отправлено ✓</p>
                    ) : (
                      <div className="mt-2 flex gap-2">
                        <input
                          type={msg.field === "email" ? "email" : msg.field === "phone" ? "tel" : "text"}
                          placeholder={CONTACT_FIELD_LABELS[msg.field]}
                          value={contactInputs[msg.id] ?? ""}
                          onChange={(e) =>
                            setContactInputs((prev) => ({ ...prev, [msg.id]: e.target.value }))
                          }
                          className="flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400"
                        />
                        <button
                          onClick={() => sendContactResponse(msg.id, msg.field!)}
                          disabled={!(contactInputs[msg.id] ?? "").trim() || sending}
                          className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          ОК
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                      msg.role === "visitor"
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-slate-100 text-slate-800 rounded-bl-sm"
                    }`}
                  >
                    {msg.text}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-slate-100 p-3">
            {blocked ? (
              <p className="py-1 text-center text-xs text-red-400">Отправка сообщений заблокирована</p>
            ) : (
              <>
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={2}
                    placeholder="Введите сообщение…"
                    className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:bg-white transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || sending}
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors"
                    aria-label="Отправить"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
                    </svg>
                  </button>
                </div>
                <p className="mt-1.5 text-center text-xs text-slate-400">Enter — отправить · Shift+Enter — новая строка</p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-colors sm:right-6"
        aria-label="Открыть чат"
      >
        {open ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
          </svg>
        )}
      </button>
    </>
  );
}
