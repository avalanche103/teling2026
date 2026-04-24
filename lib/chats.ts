import fs from "fs";
import path from "path";

const CHATS_FILE = path.join(process.cwd(), "data", "chats.json");

export type ContactField = "phone" | "email" | "organization";

export interface ChatMessage {
  id: string;
  role: "visitor" | "support";
  /** text = plain message; contact_request = operator asks for a field; contact_response = visitor replies */
  type: "text" | "contact_request" | "contact_response";
  text: string;
  field?: ContactField;
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
  visitorInfo: VisitorInfo;
  messages: ChatMessage[];
}

function readChats(): Chat[] {
  try {
    const raw = fs.readFileSync(CHATS_FILE, "utf-8");
    // Migrate legacy chats that may lack new fields
    const data = JSON.parse(raw) as Partial<Chat>[];
    return data.map((c) => ({
      blocked: false,
      visitorInfo: {},
      ...c,
      messages: (c.messages ?? []).map((m) => ({
        ...m,
        type: m.type ?? "text",
      })),
    })) as Chat[];
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
  type: "text" | "contact_request" | "contact_response" = "text",
  field?: ContactField
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
  chats[idx].messages.push(msg);
  chats[idx].updatedAt = now;
  writeChats(chats);
  return chats[idx];
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
