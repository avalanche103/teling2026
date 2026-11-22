import {
  appendMessage,
  getChatById,
  markChatNeedsHuman,
  type Chat,
} from "@/lib/chats";
import { sendAiEscalationNotification } from "@/lib/email";
import { buildCatalogContext } from "@/lib/ai/catalog-context";
import {
  generateSupportReply,
  isYandexChatConfigured,
  type EscalateReason,
} from "@/lib/ai/yandex-chat";

export const AI_AUTHOR = { id: "ai-assistant", name: "Галина" } as const;

function escalateLabel(reason: EscalateReason | null): string {
  if (reason === "order") return "Посетитель хочет оформить заказ / получить КП";
  return "Посетитель просит соединить с оператором";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Target ~2.5–3s from start so the reply does not feel instant. */
async function pauseForHumanFeel(startedAt: number): Promise<void> {
  const targetMs = 2500 + Math.floor(Math.random() * 500);
  const elapsed = Date.now() - startedAt;
  const wait = Math.max(0, targetMs - elapsed);
  if (wait > 0) await sleep(wait);
}

/** AI keeps talking until an operator claims the chat (escalation does not mute it). */
export function shouldRunChatBot(
  chat: Chat,
  msgType: "text" | "contact_response"
): boolean {
  if (msgType !== "text") return false;
  if (!isYandexChatConfigured()) return false;
  if (chat.blocked) return false;
  if (chat.assignedToId) return false;
  return true;
}

/**
 * Generate and append an AI support reply. On escalate: notify operators, keep chatting.
 * Never throws — visitor POST must succeed even if AI fails.
 */
export async function maybeReplyWithChatBot(chatId: string): Promise<Chat | null> {
  const fresh = getChatById(chatId);
  if (!fresh || !shouldRunChatBot(fresh, "text")) return fresh ?? null;

  const startedAt = Date.now();
  const alreadyEscalated = Boolean(fresh.needsHuman);

  const history = fresh.messages
    .filter((m) => m.type === "text" && (m.role === "visitor" || m.role === "support"))
    .map((m) => ({ role: m.role as "visitor" | "support", text: m.text }));

  const lastVisitor = [...history].reverse().find((m) => m.role === "visitor");
  const catalogContext = lastVisitor
    ? buildCatalogContext(lastVisitor.text)
    : null;

  const result = await generateSupportReply(
    history,
    catalogContext ?? undefined
  );
  if (!result) return getChatById(chatId) ?? null;

  await pauseForHumanFeel(startedAt);

  // Operator may have claimed while we waited on the model / delay.
  const stillOpen = getChatById(chatId);
  if (!stillOpen || stillOpen.assignedToId) {
    return stillOpen ?? null;
  }

  let chat = appendMessage(
    chatId,
    "support",
    result.reply,
    "text",
    undefined,
    AI_AUTHOR
  );
  if (!chat) return null;

  // First escalation only — notify operators; keep AI replies afterward.
  if (result.escalate && !alreadyEscalated && !stillOpen.needsHuman) {
    const reason = result.escalateReason ?? "human";
    chat = markChatNeedsHuman(chatId, reason, escalateLabel(reason));
    if (chat) {
      sendAiEscalationNotification(chat, reason).catch((err) => {
        console.error("[email] AI escalation notify failed:", err);
      });
    }
  }

  return chat ?? getChatById(chatId) ?? null;
}
