import nodemailer from "nodemailer";
import SMTPTransport from "nodemailer/lib/smtp-transport";
import type { Chat } from "@/lib/chats";

const NOTIFY_TO = process.env.CHAT_NOTIFY_EMAIL ?? "info@teling.by";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "465", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const secure = process.env.SMTP_SECURE !== "false"; // default true (SSL)

  if (!host || !user || !pass) {
    return null;
  }

  const options: SMTPTransport.Options = {
    host,
    port,
    secure,
    auth: { user, pass },
  };

  return nodemailer.createTransport(
    { ...options, family: 4 } as SMTPTransport.Options & { family: number }
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ru-BY", {
    timeZone: "Europe/Minsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildTranscript(chat: Chat): string {
  return chat.messages
    .filter((m) => m.type === "text" || m.type === "contact_response")
    .map((m) => {
      const who = m.role === "visitor" ? "Посетитель" : "Оператор";
      return `[${formatDate(m.createdAt)}] ${who}: ${m.text}`;
    })
    .join("\n");
}

function buildVisitorSummary(chat: Chat): string {
  const vi = chat.visitorInfo;
  const lines: string[] = [];
  if (vi.phone) lines.push(`Телефон: ${vi.phone}`);
  if (vi.email) lines.push(`Email: ${vi.email}`);
  if (vi.organization) lines.push(`Организация: ${vi.organization}`);
  if (vi.ip) lines.push(`IP: ${vi.ip}`);
  if (vi.deviceType) lines.push(`Устройство: ${vi.deviceType}`);
  if (vi.referrer) lines.push(`Источник: ${vi.referrer}`);
  return lines.join("\n") || "(нет данных)";
}

/**
 * Отправляет транскрипт состоявшегося диалога.
 */
export async function sendChatTranscript(chat: Chat): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.warn("[email] SMTP не настроен — письмо не отправлено.");
    return;
  }

  const transcript = buildTranscript(chat);
  const visitor = buildVisitorSummary(chat);
  const started = formatDate(chat.createdAt);
  const msgCount = chat.messages.length;

  const text = `Диалог завершён: ${started}
Сообщений: ${msgCount}

--- Данные посетителя ---
${visitor}

--- Переписка ---
${transcript}

---
ID диалога: ${chat.id}
`;

  const html = `<h2>Диалог завершён — ${started}</h2>
<p><b>Сообщений:</b> ${msgCount}</p>
<h3>Данные посетителя</h3>
<pre style="background:#f5f5f5;padding:8px;border-radius:4px">${visitor}</pre>
<h3>Переписка</h3>
<pre style="background:#f5f5f5;padding:8px;border-radius:4px;white-space:pre-wrap">${transcript}</pre>
<p style="color:#888;font-size:12px">ID: ${chat.id}</p>`;

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"Teling Chat" <${process.env.SMTP_USER}>`,
    to: NOTIFY_TO,
    subject: `✅ Чат завершён — ${started}`,
    text,
    html,
  });
}

export async function sendInactiveChatTranscript(chat: Chat): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.warn("[email] SMTP не настроен - письмо не отправлено.");
    return;
  }

  const transcript = buildTranscript(chat);
  const visitor = buildVisitorSummary(chat);
  const started = formatDate(chat.createdAt);
  const lastActivity = formatDate(chat.updatedAt);
  const msgCount = chat.messages.length;

  const text = `Диалог без активности 30 минут
Начало: ${started}
Последняя активность: ${lastActivity}
Сообщений: ${msgCount}

--- Данные посетителя ---
${visitor}

--- Переписка ---
${transcript}

---
ID диалога: ${chat.id}
`;

  const html = `<h2>Диалог без активности 30 минут</h2>
<p><b>Начало:</b> ${started}<br/><b>Последняя активность:</b> ${lastActivity}<br/><b>Сообщений:</b> ${msgCount}</p>
<h3>Данные посетителя</h3>
<pre style="background:#f5f5f5;padding:8px;border-radius:4px">${visitor}</pre>
<h3>Переписка</h3>
<pre style="background:#f5f5f5;padding:8px;border-radius:4px;white-space:pre-wrap">${transcript}</pre>
<p style="color:#888;font-size:12px">ID: ${chat.id}</p>`;

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"Teling Chat" <${process.env.SMTP_USER}>`,
    to: NOTIFY_TO,
    subject: `⏱ Диалог 30 минут без ответа - ${lastActivity}`,
    text,
    html,
  });
}

/**
 * Отправляет уведомление о пропущенном обращении (оператор был офлайн).
 */
export async function sendMissedChatNotification(chat: Chat): Promise<void> {
  const transport = createTransport();
  if (!transport) {
    console.warn("[email] SMTP не настроен — письмо не отправлено.");
    return;
  }

  const visitor = buildVisitorSummary(chat);
  const started = formatDate(chat.createdAt);
  const firstMsg = chat.messages[0]?.text ?? "";

  const text = `Пропущенное обращение: ${started}

Первое сообщение:
"${firstMsg}"

--- Данные посетителя ---
${visitor}

---
ID диалога: ${chat.id}
`;

  const html = `<h2>⚠️ Пропущенное обращение — ${started}</h2>
<p><b>Первое сообщение:</b></p>
<blockquote style="border-left:4px solid #f0a;padding:4px 12px;margin:8px 0">${firstMsg}</blockquote>
<h3>Данные посетителя</h3>
<pre style="background:#f5f5f5;padding:8px;border-radius:4px">${visitor}</pre>
<p style="color:#888;font-size:12px">ID: ${chat.id}</p>`;

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"Teling Chat" <${process.env.SMTP_USER}>`,
    to: NOTIFY_TO,
    subject: `⚠️ Пропущенный чат — ${started}`,
    text,
    html,
  });
}
