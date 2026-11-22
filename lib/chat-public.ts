import type { ChatMessage } from "@/lib/chats";

/** Visitor-facing support name: AI = Галина, main admin = Антон, others = first name. */
export function publicAuthorName(
  authorId?: string,
  authorName?: string
): string | undefined {
  if (authorId === "ai-assistant") return "Галина";
  if (authorId === "seed-admin") return "Антон";
  if (!authorName?.trim()) return undefined;

  const name = authorName.trim();
  if (/teling\s*бот/i.test(name) || /^галина$/i.test(name)) return "Галина";
  if (/главн/i.test(name) || /^админ/i.test(name) || /^антон$/i.test(name)) {
    return "Антон";
  }
  return name.split(/\s+/)[0];
}

/** Strip internal system notes; rewrite support display names for the widget. */
export function messagesForVisitor(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.type !== "system")
    .map((m) => {
      if (m.role !== "support") return m;
      const authorName = publicAuthorName(m.authorId, m.authorName);
      if (authorName === m.authorName) return m;
      return { ...m, authorName };
    });
}
