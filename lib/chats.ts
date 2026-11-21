import fs from "fs";
import path from "path";

const CHATS_FILE = path.join(process.cwd(), "data", "chats.json");

export type ContactField = "phone" | "email" | "organization";

export type AssignmentAction = "claim" | "transfer" | "takeover" | "release";

export interface AssignmentHistoryEntry {
  at: string;
  fromId: string | null;
  toId: string | null;
  byId: string;
  action: AssignmentAction;
}

export interface ChatMessage {
  id: string;
  role: "visitor" | "support";
  /** text = plain message; contact_request = operator asks for a field; contact_response = visitor replies; system = assignment event */
  type: "text" | "contact_request" | "contact_response" | "system";
  text: string;
  field?: ContactField;
  authorId?: string;
  authorName?: string;
  createdAt: string;
}

export interface VisitorInfo {
  userAgent?: string;
  ip?: string;
  language?: string;
  timeZone?: string;
  locale?: string;
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
}

export interface Chat {
  id: string;
  visitorId: string;
  createdAt: string;
  updatedAt: string;
  blocked: boolean;
  assignedToId: string | null;
  assignedToName?: string;
  assignedAt?: string;
  assignmentHistory?: AssignmentHistoryEntry[];
  lastInactivityEmailAt?: string;
  lastInactivityEmailMessageId?: string;
  visitorInfo: VisitorInfo;
  messages: ChatMessage[];
}

export type ChatListScope = "all" | "mine" | "queue" | "default";

function readChats(): Chat[] {
  try {
    const raw = fs.readFileSync(CHATS_FILE, "utf-8");
    const data = JSON.parse(raw) as Partial<Chat>[];
    return data.map((c) => {
      const assignedToId =
        c.assignedToId === undefined ? null : (c.assignedToId as string | null);
      return {
        blocked: false,
        visitorInfo: {},
        ...c,
        assignedToId,
        messages: (c.messages ?? []).map((m) => ({
          ...m,
          type: m.type ?? "text",
        })),
      } as Chat;
    });
  } catch {
    return [];
  }
}

function writeChats(chats: Chat[]): void {
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2), "utf-8");
}

export function getChats(): Chat[] {
  return readChats();
}

export function getChatById(id: string): Chat | undefined {
  return readChats().find((c) => c.id === id);
}

export function getChatByVisitorId(visitorId: string): Chat | undefined {
  return readChats().find((c) => c.visitorId === visitorId);
}

export function filterChatsForUser(
  chats: Chat[],
  userId: string,
  role: string,
  scope: ChatListScope = "default"
): Chat[] {
  if (role === "admin") {
    if (scope === "mine") {
      return chats.filter((c) => c.assignedToId === userId);
    }
    if (scope === "queue") {
      return chats.filter((c) => !c.assignedToId);
    }
    // all | default → everything for admin
    return chats;
  }

  // operator / employee: queue + own (ignore "all")
  if (scope === "mine") {
    return chats.filter((c) => c.assignedToId === userId);
  }
  if (scope === "queue") {
    return chats.filter((c) => !c.assignedToId);
  }
  return chats.filter((c) => !c.assignedToId || c.assignedToId === userId);
}

export function canReplyToChat(chat: Chat, userId: string): boolean {
  return chat.assignedToId === userId;
}

export function createChat(
  visitorId: string,
  firstMessage: string,
  visitorInfo?: VisitorInfo
): Chat {
  const chats = readChats();
  const now = new Date().toISOString();
  const chat: Chat = {
    id: crypto.randomUUID(),
    visitorId,
    createdAt: now,
    updatedAt: now,
    blocked: false,
    assignedToId: null,
    visitorInfo: { firstSeenAt: now, ...visitorInfo },
    messages: [
      {
        id: crypto.randomUUID(),
        role: "visitor",
        type: "text",
        text: firstMessage,
        createdAt: now,
      },
    ],
  };
  chats.push(chat);
  writeChats(chats);
  return chat;
}

export function appendMessage(
  chatId: string,
  role: "visitor" | "support",
  text: string,
  type: ChatMessage["type"] = "text",
  field?: ContactField,
  author?: { id: string; name: string }
): Chat | null {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return null;
  const now = new Date().toISOString();
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    role,
    type,
    text,
    createdAt: now,
  };
  if (field) msg.field = field;
  if (author) {
    msg.authorId = author.id;
    msg.authorName = author.name;
  }
  chats[idx].messages.push(msg);
  chats[idx].updatedAt = now;
  writeChats(chats);
  return chats[idx];
}

function pushAssignment(
  chat: Chat,
  entry: AssignmentHistoryEntry,
  systemText: string
): void {
  chat.assignmentHistory = [...(chat.assignmentHistory ?? []), entry];
  chat.messages.push({
    id: crypto.randomUUID(),
    role: "support",
    type: "system",
    text: systemText,
    createdAt: entry.at,
  });
  chat.updatedAt = entry.at;
}

export type AssignResult =
  | { ok: true; chat: Chat }
  | { ok: false; error: string; status: number };

export function claimChat(
  chatId: string,
  user: { id: string; name: string }
): AssignResult {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return { ok: false, error: "chat not found", status: 404 };

  const chat = chats[idx];
  if (chat.assignedToId) {
    return { ok: false, error: "Чат уже назначен", status: 409 };
  }

  const now = new Date().toISOString();
  chat.assignedToId = user.id;
  chat.assignedToName = user.name;
  chat.assignedAt = now;
  pushAssignment(
    chat,
    {
      at: now,
      fromId: null,
      toId: user.id,
      byId: user.id,
      action: "claim",
    },
    `Диалог взят оператором: ${user.name}`
  );
  writeChats(chats);
  return { ok: true, chat };
}

export function transferChat(
  chatId: string,
  byUser: { id: string; name: string; role: string },
  toUser: { id: string; name: string }
): AssignResult {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return { ok: false, error: "chat not found", status: 404 };

  const chat = chats[idx];
  if (!chat.assignedToId) {
    return { ok: false, error: "Сначала возьмите чат из очереди", status: 400 };
  }
  if (byUser.role !== "admin" && chat.assignedToId !== byUser.id) {
    return { ok: false, error: "Можно передать только свой чат", status: 403 };
  }
  if (toUser.id === chat.assignedToId) {
    return { ok: false, error: "Чат уже у этого оператора", status: 400 };
  }

  const now = new Date().toISOString();
  const fromId = chat.assignedToId;
  const fromName = chat.assignedToName ?? "оператор";
  chat.assignedToId = toUser.id;
  chat.assignedToName = toUser.name;
  chat.assignedAt = now;
  pushAssignment(
    chat,
    {
      at: now,
      fromId,
      toId: toUser.id,
      byId: byUser.id,
      action: "transfer",
    },
    `Диалог передан: ${fromName} → ${toUser.name}`
  );
  writeChats(chats);
  return { ok: true, chat };
}

export function takeoverChat(
  chatId: string,
  admin: { id: string; name: string }
): AssignResult {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return { ok: false, error: "chat not found", status: 404 };

  const chat = chats[idx];
  if (chat.assignedToId === admin.id) {
    return { ok: false, error: "Чат уже у вас", status: 400 };
  }

  const now = new Date().toISOString();
  const fromId = chat.assignedToId;
  const fromName = chat.assignedToName;
  chat.assignedToId = admin.id;
  chat.assignedToName = admin.name;
  chat.assignedAt = now;
  pushAssignment(
    chat,
    {
      at: now,
      fromId,
      toId: admin.id,
      byId: admin.id,
      action: "takeover",
    },
    fromName
      ? `Админ забрал диалог у ${fromName}: ${admin.name}`
      : `Админ взял диалог из очереди: ${admin.name}`
  );
  writeChats(chats);
  return { ok: true, chat };
}

export function updateVisitorInfo(
  chatId: string,
  info: Partial<VisitorInfo>
): void {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return;
  chats[idx].visitorInfo = { ...chats[idx].visitorInfo, ...info };
  writeChats(chats);
}

export function blockChat(chatId: string, blocked: boolean): Chat | null {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return null;
  chats[idx].blocked = blocked;
  writeChats(chats);
  return chats[idx];
}

export function deleteChat(chatId: string): boolean {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return false;
  chats.splice(idx, 1);
  writeChats(chats);
  return true;
}

/** Admin bulk delete. Returns number of removed chats. */
export function deleteChats(chatIds: string[]): number {
  if (chatIds.length === 0) return 0;
  const remove = new Set(chatIds);
  const chats = readChats();
  const next = chats.filter((c) => !remove.has(c.id));
  const removed = chats.length - next.length;
  if (removed > 0) writeChats(next);
  return removed;
}

const INACTIVITY_MS = 30 * 60 * 1000;

export function getChatsNeedingInactivityEmail(nowMs = Date.now()): Chat[] {
  return readChats().filter((chat) => {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (!lastMessage) return false;
    const lastMessageMs = Date.parse(lastMessage.createdAt);
    if (Number.isNaN(lastMessageMs)) return false;
    if (nowMs - lastMessageMs < INACTIVITY_MS) return false;
    return chat.lastInactivityEmailMessageId !== lastMessage.id;
  });
}

export function markInactivityEmailSent(
  chatId: string,
  lastMessageId: string
): Chat | null {
  const chats = readChats();
  const idx = chats.findIndex((c) => c.id === chatId);
  if (idx === -1) return null;
  chats[idx].lastInactivityEmailAt = new Date().toISOString();
  chats[idx].lastInactivityEmailMessageId = lastMessageId;
  writeChats(chats);
  return chats[idx];
}
