"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ChatWidget = dynamic(
  () => import("@/components/chat/ChatWidget").then((m) => m.ChatWidget),
  { ssr: false }
);

/**
 * Defer chat chunk until the browser is idle (or after a short timeout),
 * so homepage Lighthouse/PSI does not pay for chat JS on first paint.
 */
export function LazyChatWidget() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let idleId: number | undefined;

    const enable = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(enable, { timeout: 4000 });
    } else {
      timeoutId = setTimeout(enable, 2500);
    }

    return () => {
      cancelled = true;
      if (idleId !== undefined && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  if (!ready) return null;
  return <ChatWidget />;
}
