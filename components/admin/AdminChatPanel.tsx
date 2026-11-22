"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface Message {
  id: string;
  role: "visitor" | "support";
  text: string;
  type?: "text" | "contact_request" | "contact_response" | "system";
  authorName?: string;
  createdAt: string;
}

interface Chat {
  id: string;
  visitorId: string;
  createdAt: string;
  updatedAt: string;
  blocked: boolean;
  assignedToId: string | null;
  assignedToName?: string;
  needsHuman?: boolean;
  needsHumanAt?: string;
  needsHumanReason?: "order" | "human";
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

interface StaffUser {
  id: string;
  username: string;
  name: string;
  role: "admin" | "employee" | "operator";
}

type ContactField = "phone" | "email" | "organization";
type ChatScope = "default" | "queue" | "mine" | "all";

const CONTACT_LABELS: Record<ContactField, string> = {
  phone: "Телефон",
  email: "Email",
  organization: "Организация",
};

const SEEN_KEY = "admin_chat_seen";

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
  if (!lastMsg || lastMsg.role !== "visitor" || lastMsg.type === "system") return false;
  const seenCount = getSeenCounts()[chat.id] ?? 0;
  return chat.messages.length > seenCount;
}

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
    const n = new Notification(title, { body, icon: "/favicon.ico" });
    n.onclick = () => {
      focusDesktopWindow();
      try {
        window.focus();
      } catch {
        // ignore
      }
      n.close();
    };
  } catch {
    // ignore
  }
}

/** Bring Tauri "Teling Чат" out of tray when a new queue chat arrives. */
function focusDesktopWindow() {
  if (typeof window === "undefined") return;
  const desktop = (
    window as Window & {
      __TELING_DESKTOP__?: { focus?: () => void | Promise<unknown> };
    }
  ).__TELING_DESKTOP__;
  try {
    desktop?.focus?.();
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new Event("teling-desktop-focus"));
  } catch {
    // ignore
  }
}

export function AdminChatPanel({
  initialUser,
}: {
  initialUser?: StaffUser | null;
} = {}) {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [scope, setScope] = useState<ChatScope>("default");
  const [me, setMe] = useState<StaffUser | null>(initialUser ?? null);
  const [operators, setOperators] = useState<StaffUser[]>([]);
  const [transferToId, setTransferToId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<Chat | null>(null);
  const [messageAlert, setMessageAlert] = useState<Chat | null>(null);
  const [offerError, setOfferError] = useState<string | null>(null);
  const prevCountsRef = useRef<Record<string, number>>({});
  const myMsgCountsRef = useRef<Record<string, number> | null>(null);
  const knownQueueIdsRef = useRef<Set<string> | null>(null);
  const dismissedOffersRef = useRef<Set<string>>(new Set());
  const activeOfferIdRef = useRef<string | null>(null);
  const lastNotifiedOfferRef = useRef<string | null>(null);
  const lastNotifiedMsgAlertRef = useRef<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const queuePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const minePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const fetchChats = useCallback(
    async () => {
      try {
        const qs = scope === "default" ? "" : `?scope=${scope}`;
        const res = await fetch(`/api/admin/chats${qs}`);
        if (!res.ok) return;
        const data: Chat[] = await res.json();

        data.forEach((chat) => {
          prevCountsRef.current[chat.id] = chat.messages.length;
        });

        setChats(data);
        setSelectedId((prev) => {
          if (!prev) return prev;
          return data.some((c) => c.id === prev) ? prev : null;
        });
      } catch {
        // ignore
      }
    },
    [scope]
  );

  const notifiedEscalationsRef = useRef<Set<string>>(new Set());
  /** Only suppress a specific escalation instance (chatId + needsHumanAt). */
  const dismissedEscalationsRef = useRef<Set<string>>(new Set());

  const pollQueueOffers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chats?scope=queue");
      if (!res.ok) return;
      const queue: Chat[] = await res.json();
      const queueIds = new Set(queue.map((c) => c.id));

      // Drop offer if someone else already claimed it.
      if (activeOfferIdRef.current && !queueIds.has(activeOfferIdRef.current)) {
        activeOfferIdRef.current = null;
        setIncomingOffer(null);
      }

      if (knownQueueIdsRef.current === null) {
        knownQueueIdsRef.current = new Set(queueIds);
        for (const c of queue) {
          if (c.needsHuman && c.needsHumanAt) {
            notifiedEscalationsRef.current.add(`${c.id}:${c.needsHumanAt}`);
          }
        }
        return;
      }

      // AI escalation (order / human) — highest priority: raise desktop even if
      // the operator earlier hid the plain "new chat" offer for this dialog.
      const escalated = queue
        .filter((c) => {
          if (!c.needsHuman || !c.needsHumanAt) return false;
          const key = `${c.id}:${c.needsHumanAt}`;
          if (notifiedEscalationsRef.current.has(key)) return false;
          if (dismissedEscalationsRef.current.has(key)) return false;
          return true;
        })
        .sort(
          (a, b) =>
            new Date(b.needsHumanAt!).getTime() -
            new Date(a.needsHumanAt!).getTime()
        );
      if (escalated.length > 0) {
        const chat = escalated[0];
        const key = `${chat.id}:${chat.needsHumanAt}`;
        notifiedEscalationsRef.current.add(key);
        knownQueueIdsRef.current.add(chat.id);
        // Allow re-offer after a prior "Скрыть" on the same chat.
        dismissedOffersRef.current.delete(chat.id);
        activeOfferIdRef.current = chat.id;
        setIncomingOffer(chat);
        focusDesktopWindow();
        return;
      }

      // Refresh preview for the current non-escalation offer.
      if (activeOfferIdRef.current) {
        const updated = queue.find((c) => c.id === activeOfferIdRef.current);
        if (updated) setIncomingOffer(updated);
        return;
      }

      const fresh = queue
        .filter(
          (c) =>
            !knownQueueIdsRef.current!.has(c.id) &&
            !dismissedOffersRef.current.has(c.id)
        )
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

      if (fresh.length === 0) return;

      const newest = fresh[0];
      knownQueueIdsRef.current.add(newest.id);
      activeOfferIdRef.current = newest.id;
      setIncomingOffer(newest);
      focusDesktopWindow();
    } catch {
      // ignore
    }
  }, []);

  const pollMyMessageAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/chats?scope=mine");
      if (!res.ok) return;
      const mine: Chat[] = await res.json();

      if (myMsgCountsRef.current === null) {
        const seed: Record<string, number> = {};
        mine.forEach((c) => {
          seed[c.id] = c.messages.length;
        });
        myMsgCountsRef.current = seed;
        return;
      }

      const alerts: Chat[] = [];
      let anyNewVisitor = false;
      for (const chat of mine) {
        const prev = myMsgCountsRef.current[chat.id] ?? 0;
        if (chat.messages.length > prev) {
          const newMsgs = chat.messages.slice(prev);
          const hasNewVisitor = newMsgs.some(
            (m) => m.role === "visitor" && m.type !== "system"
          );
          if (hasNewVisitor) {
            anyNewVisitor = true;
            // Modal only if operator is not already looking at this chat.
            if (chat.id !== selectedIdRef.current) alerts.push(chat);
          }
        }
        myMsgCountsRef.current[chat.id] = chat.messages.length;
      }

      const mineIds = new Set(mine.map((c) => c.id));
      Object.keys(myMsgCountsRef.current).forEach((id) => {
        if (!mineIds.has(id)) delete myMsgCountsRef.current![id];
      });

      if (!anyNewVisitor) return;

      // Always bring desktop window up (even if this chat is already open).
      focusDesktopWindow();

      if (alerts.length === 0) return;

      const newest = [...alerts].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];

      setMessageAlert((prev) => {
        if (prev && prev.id === newest.id) return newest;
        return prev ?? newest;
      });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!incomingOffer) return;
    const notifyKey = incomingOffer.needsHuman
      ? `esc:${incomingOffer.id}:${incomingOffer.needsHumanAt ?? ""}`
      : `new:${incomingOffer.id}`;
    if (lastNotifiedOfferRef.current === notifyKey) return;
    lastNotifiedOfferRef.current = notifyKey;
    setOfferError(null);
    focusDesktopWindow();
    const preview =
      incomingOffer.messages.find((m) => m.role === "visitor" && m.type !== "system")
        ?.text ?? "Новый диалог в очереди";
    const title = incomingOffer.needsHuman
      ? incomingOffer.needsHumanReason === "order"
        ? "Чат: заказ / КП — нужен оператор"
        : "Чат: посетитель просит оператора"
      : "Новый чат — заберите диалог";
    sendBrowserNotification(
      title,
      preview.length > 80 ? preview.slice(0, 80) + "…" : preview
    );
  }, [incomingOffer]);

  useEffect(() => {
    if (!messageAlert || incomingOffer) return;
    const key = `${messageAlert.id}:${messageAlert.messages.length}`;
    if (lastNotifiedMsgAlertRef.current === key) return;
    lastNotifiedMsgAlertRef.current = key;
    focusDesktopWindow();
    const lastVisitor = [...messageAlert.messages]
      .reverse()
      .find((m) => m.role === "visitor" && m.type !== "system");
    const preview = lastVisitor?.text ?? "Новое сообщение";
    sendBrowserNotification(
      "Новое сообщение в чате",
      preview.length > 80 ? preview.slice(0, 80) + "…" : preview
    );
  }, [messageAlert, incomingOffer]);

  useEffect(() => {
    if (!initialUser) {
      fetch("/api/admin/me")
        .then((r) => (r.ok ? r.json() : null))
        .then((data: StaffUser | null) => {
          if (data) setMe(data);
        })
        .catch(() => {});
    }
    fetch("/api/admin/chat-operators")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: StaffUser[]) => setOperators(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [initialUser]);

  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function ping() {
      fetch("/api/admin/heartbeat", { method: "POST" }).catch(() => {});
    }
    ping();
    heartbeatRef.current = setInterval(ping, 30_000);
    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  useEffect(() => {
    requestNotificationPermission();
    fetchChats();
    pollRef.current = setInterval(fetchChats, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchChats]);

  useEffect(() => {
    pollQueueOffers();
    queuePollRef.current = setInterval(pollQueueOffers, 4000);
    return () => {
      if (queuePollRef.current) clearInterval(queuePollRef.current);
    };
  }, [pollQueueOffers]);

  useEffect(() => {
    pollMyMessageAlerts();
    minePollRef.current = setInterval(pollMyMessageAlerts, 4000);
    return () => {
      if (minePollRef.current) clearInterval(minePollRef.current);
    };
  }, [pollMyMessageAlerts]);

  useEffect(() => {
    if (!selectedId) return;
    const chat = chats.find((c) => c.id === selectedId);
    if (chat) markSeen(selectedId, chat.messages.length);
  }, [selectedId, chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedId, chats]);

  const selected = chats.find((c) => c.id === selectedId);
  const isMine = Boolean(me && selected && selected.assignedToId === me.id);
  const isQueue = Boolean(selected && !selected.assignedToId);
  const isAdmin = me?.role === "admin";
  const canReply = isMine;
  const canTransfer = Boolean(selected?.assignedToId && (isMine || isAdmin));
  const canTakeover = Boolean(
    isAdmin && selected && selected.assignedToId !== me?.id
  );

  async function sendReply() {
    if (!replyText.trim() || !selectedId || sending || !canReply) return;
    setSending(true);
    setActionError(null);
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
      } else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось отправить");
        setReplyText(text);
      }
    } catch {
      setReplyText(text);
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
    if (!selectedId || sending || !canReply) return;
    setSending(true);
    setActionError(null);
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
      else {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось отправить запрос");
      }
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
      if (res.ok) await fetchChats();
    } catch {
      // ignore
    } finally {
      setBlockingId(null);
    }
  }

  async function deleteSelectedChat() {
    if (!selectedId || !isAdmin || deleting) return;
    const ok = window.confirm(
      "Удалить этот диалог безвозвратно? История сообщений будет стёрта."
    );
    if (!ok) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/chats/${selectedId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось удалить");
        return;
      }
      setSelectedForDelete((prev) => {
        const next = new Set(prev);
        next.delete(selectedId);
        return next;
      });
      setSelectedId(null);
      setMessageAlert((prev) => (prev?.id === selectedId ? null : prev));
      await fetchChats();
      await pollQueueOffers();
    } catch {
      setActionError("Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

  async function deleteCheckedChats() {
    if (!isAdmin || deleting || selectedForDelete.size === 0) return;
    const ids = [...selectedForDelete];
    const ok = window.confirm(
      `Удалить выбранные диалоги (${ids.length}) безвозвратно?`
    );
    if (!ok) return;
    setDeleting(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/chats/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось удалить");
        return;
      }
      if (selectedId && selectedForDelete.has(selectedId)) {
        setSelectedId(null);
      }
      setSelectedForDelete(new Set());
      setMessageAlert((prev) =>
        prev && selectedForDelete.has(prev.id) ? null : prev
      );
      await fetchChats();
      await pollQueueOffers();
    } catch {
      setActionError("Не удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

  function toggleDeleteCheck(chatId: string, checked: boolean) {
    setSelectedForDelete((prev) => {
      const next = new Set(prev);
      if (checked) next.add(chatId);
      else next.delete(chatId);
      return next;
    });
  }

  async function claimChatById(chatId: string, fromOffer = false) {
    if (!chatId || assigning) return false;
    setAssigning(true);
    if (fromOffer) setOfferError(null);
    else setActionError(null);
    try {
      const res = await fetch(`/api/admin/chats/${chatId}/claim`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        const err = data.error ?? "Не удалось забрать диалог";
        if (fromOffer) setOfferError(err);
        else setActionError(err);
        if (res.status === 409) {
          activeOfferIdRef.current = null;
          setIncomingOffer(null);
          await pollQueueOffers();
        }
        return false;
      }
      activeOfferIdRef.current = null;
      setIncomingOffer(null);
      dismissedOffersRef.current.add(chatId);
      setScope("mine");
      setSelectedId(chatId);
      try {
        const mineRes = await fetch("/api/admin/chats?scope=mine");
        if (mineRes.ok) {
          const mineChats: Chat[] = await mineRes.json();
          setChats(mineChats);
          if (!myMsgCountsRef.current) myMsgCountsRef.current = {};
          mineChats.forEach((c) => {
            myMsgCountsRef.current![c.id] = c.messages.length;
          });
        }
      } catch {
        // ignore — poll will catch up
      }
      setMessageAlert(null);
      await pollQueueOffers();
      return true;
    } catch {
      if (fromOffer) setOfferError("Не удалось забрать диалог");
      else setActionError("Не удалось забрать диалог");
      return false;
    } finally {
      setAssigning(false);
    }
  }

  async function claimSelected() {
    if (!selectedId) return;
    await claimChatById(selectedId, false);
  }

  function dismissIncomingOffer() {
    if (!incomingOffer) return;
    if (incomingOffer.needsHuman && incomingOffer.needsHumanAt) {
      dismissedEscalationsRef.current.add(
        `${incomingOffer.id}:${incomingOffer.needsHumanAt}`
      );
    } else {
      dismissedOffersRef.current.add(incomingOffer.id);
    }
    activeOfferIdRef.current = null;
    setIncomingOffer(null);
    setOfferError(null);
  }

  function dismissMessageAlert() {
    setMessageAlert(null);
  }

  function openMessageAlert() {
    if (!messageAlert) return;
    const chatId = messageAlert.id;
    setMessageAlert(null);
    setScope("mine");
    setSelectedId(chatId);
    setActionError(null);
    focusDesktopWindow();
    fetch("/api/admin/chats?scope=mine")
      .then((r) => (r.ok ? r.json() : null))
      .then((mineChats: Chat[] | null) => {
        if (mineChats) setChats(mineChats);
      })
      .catch(() => {});
  }

  function previewMessages(chat: Chat, limit = 6): Message[] {
    const nonSystem = chat.messages.filter((m) => m.type !== "system");
    // For ongoing chats show the latest messages; for brand-new queue offers show the start.
    if (chat.assignedToId) {
      return nonSystem.slice(-limit);
    }
    return nonSystem.slice(0, limit);
  }

  async function transferSelected() {
    if (!selectedId || !transferToId || assigning) return;
    setAssigning(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/chats/${selectedId}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmployeeId: transferToId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось передать");
      } else {
        setTransferToId("");
      }
      await fetchChats(false);
    } catch {
      setActionError("Не удалось передать");
    } finally {
      setAssigning(false);
    }
  }

  async function takeoverSelected() {
    if (!selectedId || assigning) return;
    setAssigning(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/admin/chats/${selectedId}/takeover`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setActionError(data.error ?? "Не удалось забрать");
      }
      await fetchChats(false);
    } catch {
      setActionError("Не удалось забрать");
    } finally {
      setAssigning(false);
    }
  }

  const totalUnread = chats.filter(isUnread).length;
  const transferTargets = operators.filter((op) => op.id !== selected?.assignedToId);

  const tabs: { id: ChatScope; label: string; show: boolean }[] = [
    { id: "queue", label: "Очередь", show: true },
    { id: "mine", label: "Мои", show: true },
    { id: "all", label: "Все", show: isAdmin },
  ];

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] gap-4 md:h-[calc(100vh-10rem)]">
      <aside
        className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ${
          selected ? "hidden lg:flex" : "flex w-full"
        } ${isAdmin ? "lg:w-80" : "lg:w-72"}`}
      >
        <div className="border-b border-slate-100 px-3 py-2">
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <h2 className="text-sm font-semibold text-slate-700">
              Диалоги ({chats.length})
            </h2>
            {totalUnread > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                {totalUnread} новых
              </span>
            )}
          </div>
          {isAdmin && selectedForDelete.size > 0 && (
            <div className="mt-2 flex items-center justify-between gap-2 px-1">
              <p className="text-xs text-slate-500">
                Выбрано: {selectedForDelete.size}
              </p>
              <button
                type="button"
                onClick={deleteCheckedChats}
                disabled={deleting}
                className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-40"
              >
                Удалить выбранные
              </button>
            </div>
          )}
          <div className="mt-1 flex gap-1">
            {tabs
              .filter((t) => t.show)
              .map((tab) => {
                const isActive =
                  scope === tab.id ||
                  (scope === "default" && isAdmin && tab.id === "all");
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setScope(tab.id)}
                    className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                      isActive
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 && (
            <p className="p-4 text-sm text-slate-400">Нет диалогов</p>
          )}
          {chats.map((chat) => {
            const lastMsg = [...chat.messages].reverse().find((m) => m.type !== "system")
              ?? chat.messages[chat.messages.length - 1];
            const unread = isUnread(chat);
            const isSelected = selectedId === chat.id;
            return (
              <div
                key={chat.id}
                className={`grid w-full border-b border-slate-50 transition-colors hover:bg-blue-50 ${
                  isAdmin ? "grid-cols-[28px_minmax(0,1fr)]" : "grid-cols-1"
                } ${isSelected ? "bg-blue-50" : unread ? "bg-red-50" : ""}`}
              >
                {isAdmin && (
                  <div className="flex items-center justify-center self-stretch pl-1">
                    <input
                      type="checkbox"
                      checked={selectedForDelete.has(chat.id)}
                      onChange={(e) => toggleDeleteCheck(chat.id, e.target.checked)}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 shrink-0 cursor-pointer accent-slate-800"
                      aria-label="Выбрать для удаления"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(chat.id);
                    setActionError(null);
                    setTransferToId("");
                  }}
                  className="min-w-0 px-3 py-3 text-left"
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
                  <p className="mt-0.5 truncate text-[11px] text-slate-500">
                    {!chat.assignedToId
                      ? chat.needsHuman
                        ? "Нужен оператор"
                        : "В очереди"
                      : chat.assignedToId === me?.id
                        ? "Мой"
                        : chat.assignedToName ?? "Оператор"}
                  </p>
                  {lastMsg && (
                    <p
                      className={`mt-0.5 truncate text-sm ${
                        unread && !isSelected
                          ? "font-semibold text-slate-800"
                          : "text-slate-600"
                      }`}
                    >
                      {lastMsg.role === "support" && lastMsg.type !== "system" ? "↩ " : ""}
                      {lastMsg.text}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-slate-400">
                    {formatTime(chat.updatedAt)}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
      </aside>

      <div
        className={`min-h-0 min-w-0 flex-1 gap-3 overflow-hidden ${
          selected ? "flex" : "hidden lg:flex"
        }`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
              Выберите диалог
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
                <div className="mb-2 lg:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId(null);
                      setActionError(null);
                      setTransferToId("");
                    }}
                    className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    ← К списку
                  </button>
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-700">
                      Диалог с посетителем
                      {selected.blocked && (
                        <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600">
                          Заблокирован
                        </span>
                      )}
                      {!selected.assignedToId ? (
                        <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                          В очереди
                        </span>
                      ) : (
                        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {selected.assignedToName ?? "Оператор"}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-xs text-slate-400">ID: {selected.visitorId}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isQueue && (
                      <button
                        type="button"
                        onClick={claimSelected}
                        disabled={assigning}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                      >
                        Забрать диалог
                      </button>
                    )}
                    {canTakeover && (
                      <button
                        type="button"
                        onClick={takeoverSelected}
                        disabled={assigning}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                      >
                        Забрать
                      </button>
                    )}
                    <button
                      type="button"
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
                </div>

                {isAdmin && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                    <p className="mr-auto text-xs text-red-700">
                      Управление: удаление диалога
                    </p>
                    <button
                      type="button"
                      onClick={deleteSelectedChat}
                      disabled={deleting}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                    >
                      {deleting ? "Удаляем…" : "Удалить диалог"}
                    </button>
                  </div>
                )}

                {canTransfer && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      value={transferToId}
                      onChange={(e) => setTransferToId(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-slate-400"
                    >
                      <option value="">Передать оператору…</option>
                      {transferTargets.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.name} ({op.username})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={transferSelected}
                      disabled={!transferToId || assigning}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-900 disabled:opacity-40"
                    >
                      Передать
                    </button>
                  </div>
                )}

                {actionError && (
                  <p className="mt-2 text-xs text-red-600">{actionError}</p>
                )}

                <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50 lg:hidden">
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Данные посетителя
                  </summary>
                  <div className="space-y-2 border-t border-slate-200 px-3 py-3 text-xs">
                    <ChatVisitorFields chat={selected} formatTime={formatTime} />
                  </div>
                </details>
              </div>

              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 sm:p-4">
                {selected.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.type === "system"
                        ? "justify-center"
                        : msg.role === "support"
                          ? "justify-end"
                          : "justify-start"
                    }`}
                  >
                    {msg.type === "system" ? (
                      <p className="max-w-[90%] text-center text-xs text-slate-400">
                        {msg.text}
                      </p>
                    ) : msg.type === "contact_request" ? (
                      <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
                        Запрос: {msg.text}
                      </div>
                    ) : (
                      <div
                        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug sm:max-w-[70%] ${
                          msg.role === "support"
                            ? "bg-blue-600 text-white rounded-br-sm"
                            : "bg-slate-100 text-slate-800 rounded-bl-sm"
                        }`}
                      >
                        {msg.role === "support" && msg.authorName && (
                          <p className="mb-0.5 text-[10px] text-blue-100">
                            {msg.authorName}
                          </p>
                        )}
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

              <div className="border-t border-slate-100 p-4">
                {!canReply ? (
                  <p className="text-sm text-slate-500">
                    {isQueue
                      ? "Заберите диалог из очереди, чтобы отвечать."
                      : "Чужой диалог — только просмотр. Админ может забрать."}
                  </p>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-2">
                      {(["phone", "email", "organization"] as ContactField[]).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => sendContactRequest(f)}
                          disabled={sending}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
                        >
                          Запросить: {CONTACT_LABELS[f]}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={2}
                        placeholder="Ответ посетителю…"
                        className="w-full flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-400 focus:bg-white"
                      />
                      <button
                        type="button"
                        onClick={sendReply}
                        disabled={!replyText.trim() || sending}
                        className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-40 sm:w-auto"
                      >
                        Ответить
                      </button>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      Enter — отправить · Shift+Enter — новая строка
                    </p>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {selected && (
        <aside className="hidden w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:flex">
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Данные посетителя
            </h3>
          </div>
          <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3 text-xs">
            <ChatVisitorFields chat={selected} formatTime={formatTime} />
          </div>
        </aside>
      )}

      {incomingOffer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="incoming-chat-title"
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div
              className={`border-b border-slate-100 px-5 py-4 ${
                incomingOffer.needsHuman ? "bg-red-50" : "bg-amber-50"
              }`}
            >
              <p
                id="incoming-chat-title"
                className="text-base font-bold text-slate-900"
              >
                {incomingOffer.needsHuman
                  ? incomingOffer.needsHumanReason === "order"
                    ? "Нужен оператор: заказ / КП"
                    : "Нужен оператор: посетитель просит человека"
                  : "Новый чат в очереди"}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {incomingOffer.needsHuman
                  ? "Бот передал диалог. Заберите его, чтобы ответить посетителю."
                  : "Все онлайн-операторы видят начало диалога. Кто первый заберёт — тот ведёт дальше."}
              </p>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto px-5 py-4">
              {previewMessages(incomingOffer).length === 0 ? (
                <p className="text-sm text-slate-400">Пока нет сообщений</p>
              ) : (
                previewMessages(incomingOffer).map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${
                      msg.role === "visitor" ? "justify-start" : "justify-end"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                        msg.role === "visitor"
                          ? "bg-slate-100 text-slate-800 rounded-bl-sm"
                          : "bg-blue-600 text-white rounded-br-sm"
                      }`}
                    >
                      <p>{msg.text}</p>
                      <p
                        className={`mt-1 text-right text-[10px] ${
                          msg.role === "visitor" ? "text-slate-400" : "text-blue-200"
                        }`}
                      >
                        {formatTime(msg.createdAt)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {offerError && (
              <p className="px-5 pb-2 text-xs text-red-600">{offerError}</p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={dismissIncomingOffer}
                disabled={assigning}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-40"
              >
                Скрыть
              </button>
              <button
                type="button"
                onClick={() => claimChatById(incomingOffer.id, true)}
                disabled={assigning}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {assigning ? "Забираем…" : "Забрать диалог"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!incomingOffer && messageAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="message-alert-title"
            className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 bg-blue-50 px-5 py-4">
              <p
                id="message-alert-title"
                className="text-base font-bold text-slate-900"
              >
                Новое сообщение в чате
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Посетитель написал в ваш диалог.
              </p>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto px-5 py-4">
              {previewMessages(messageAlert).map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === "visitor" ? "justify-start" : "justify-end"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-snug ${
                      msg.role === "visitor"
                        ? "bg-slate-100 text-slate-800 rounded-bl-sm"
                        : "bg-blue-600 text-white rounded-br-sm"
                    }`}
                  >
                    <p>{msg.text}</p>
                    <p
                      className={`mt-1 text-right text-[10px] ${
                        msg.role === "visitor" ? "text-slate-400" : "text-blue-200"
                      }`}
                    >
                      {formatTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4">
              <button
                type="button"
                onClick={dismissMessageAlert}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200"
              >
                Скрыть
              </button>
              <button
                type="button"
                onClick={openMessageAlert}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Открыть диалог
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChatVisitorFields({
  chat,
  formatTime,
}: {
  chat: Chat;
  formatTime: (iso: string) => string;
}) {
  const info = chat.visitorInfo;
  return (
    <>
      {chat.assignedToName && (
        <div>
          <p className="text-slate-400">Оператор</p>
          <p className="font-medium text-slate-700">{chat.assignedToName}</p>
        </div>
      )}
      {info?.ip && (
        <div>
          <p className="text-slate-400">IP-адрес</p>
          <p className="font-medium text-slate-700">{info.ip}</p>
        </div>
      )}
      {info?.firstSeenAt && (
        <div>
          <p className="text-slate-400">Первое обращение</p>
          <p className="font-medium text-slate-700">{formatTime(info.firstSeenAt)}</p>
        </div>
      )}
      {info?.phone && (
        <div>
          <p className="text-slate-400">Телефон</p>
          <p className="font-medium text-slate-700">{info.phone}</p>
        </div>
      )}
      {info?.email && (
        <div>
          <p className="text-slate-400">Email</p>
          <p className="break-all font-medium text-slate-700">{info.email}</p>
        </div>
      )}
      {info?.organization && (
        <div>
          <p className="text-slate-400">Организация</p>
          <p className="font-medium text-slate-700">{info.organization}</p>
        </div>
      )}
      {info?.userAgent && (
        <div>
          <p className="text-slate-400">Браузер</p>
          <p className="break-all leading-tight text-slate-600">{info.userAgent}</p>
        </div>
      )}
      {info?.deviceType && (
        <div>
          <p className="text-slate-400">Устройство</p>
          <p className="font-medium text-slate-700">{info.deviceType}</p>
        </div>
      )}
      {info?.platform && (
        <div>
          <p className="text-slate-400">Платформа</p>
          <p className="font-medium text-slate-700">{info.platform}</p>
        </div>
      )}
      {info?.timeZone && (
        <div>
          <p className="text-slate-400">Место (часовой пояс)</p>
          <p className="font-medium text-slate-700">{info.timeZone}</p>
        </div>
      )}
      {info?.locale && (
        <div>
          <p className="text-slate-400">Локаль</p>
          <p className="font-medium text-slate-700">{info.locale}</p>
        </div>
      )}
      {info?.language && (
        <div>
          <p className="text-slate-400">Язык браузера</p>
          <p className="font-medium text-slate-700">{info.language}</p>
        </div>
      )}
      {info?.viewport && (
        <div>
          <p className="text-slate-400">Viewport</p>
          <p className="font-medium text-slate-700">{info.viewport}</p>
        </div>
      )}
      {info?.screen && (
        <div>
          <p className="text-slate-400">Экран</p>
          <p className="font-medium text-slate-700">{info.screen}</p>
        </div>
      )}
      {info?.colorScheme && (
        <div>
          <p className="text-slate-400">Тема</p>
          <p className="font-medium text-slate-700">{info.colorScheme}</p>
        </div>
      )}
      {info?.referrer && (
        <div>
          <p className="text-slate-400">Referrer</p>
          <p className="break-all leading-tight text-slate-600">{info.referrer}</p>
        </div>
      )}
      {!info?.phone &&
        !info?.email &&
        !info?.organization &&
        !info?.ip &&
        !info?.timeZone &&
        !info?.deviceType &&
        !chat.assignedToName && (
          <p className="text-slate-400">Нет данных</p>
        )}
    </>
  );
}
