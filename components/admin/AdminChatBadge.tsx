"use client";

import { useEffect, useRef, useState } from "react";

interface Chat {
  id: string;
  messages: { role: "visitor" | "support" }[];
}

/** Returns number of chats with unread visitor messages */
function countUnread(chats: Chat[]): number {
  if (typeof window === "undefined") return 0;
  let seen: Record<string, number> = {};
  try {
    seen = JSON.parse(localStorage.getItem("admin_chat_seen") ?? "{}");
  } catch {
    // ignore
  }
  return chats.filter((c) => {
    const lastVisitorIdx = [...c.messages]
      .map((m, i) => ({ role: m.role, i }))
      .filter((x) => x.role === "visitor")
      .pop();
    if (!lastVisitorIdx) return false;
    const seenCount = seen[c.id] ?? 0;
    return c.messages.length > seenCount;
  }).length;
}

export function AdminChatBadge() {
  const [unread, setUnread] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  async function fetchAndCount() {
    try {
      const res = await fetch("/api/admin/chats");
      if (res.ok) {
        const chats: Chat[] = await res.json();
        setUnread(countUnread(chats));
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    fetchAndCount();
    pollRef.current = setInterval(fetchAndCount, 7000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Update browser tab title when unread count changes
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Save original title once
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title;
    }

    if (unread > 0) {
      document.title = `💬 ${unread} новых сообщений — ${originalTitleRef.current}`;
    } else {
      document.title = originalTitleRef.current;
    }

    return () => {
      if (originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
      }
    };
  }, [unread]);

  if (unread === 0) return null;

  return (
    <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
      {unread}
    </span>
  );
}
