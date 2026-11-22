export type EscalateReason = "order" | "human";

export interface AiChatResult {
  reply: string;
  escalate: boolean;
  escalateReason: EscalateReason | null;
}

const BASE_URL = "https://ai.api.cloud.yandex.net/v1/chat/completions";
const AI_TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `Ты — Галина, онлайн-консультант компании Teling.by (Беларусь, Минск).
Компания: телекоммуникационное оборудование, материалы и комплектующие для ЛВС, ВОЛС, видеонаблюдения, кабельного ТВ и мультимедиа. Опыт более 20 лет.
Сайт-каталог: https://teling.by
Контакты:
- адрес: г. Минск, ул. Шафарнянская, 11, офис 33
- email: info@teling.by
- телефоны: +375(29)665-60-53 (A1), +375(29)247-91-04 (МТС), +375(17)270-50-95 … 270-50-99 (факс)
Заявки: форма запроса на сайте https://teling.by/request или оператор.

FAQ (всегда соблюдай):
- Цены на сайте актуальные.
- Цены в белорусских рублях (BYN).
- Основной способ получения — самовывоз.
- Доставку нужно обсуждать с менеджером (не обещай сроки/тарифы сам).
- Работаем только по Беларуси (не предлагай отгрузки в другие страны).

Каталог:
- Блок «КАТАЛОГ» бывает не всегда. Если его нет — это обычный разговор (приветствие, FAQ, контакты): отвечай по делу, НЕ пиши про поиск по каталогу и «ничего не найдено».
- Общий запрос (категория: «муфты», «кабель», «есть ли X на сайте») — в приоритете ссылки на разделы каталога из блока «Разделы». Дай 2–3 раздела с полными URL. Карточки товаров в таком ответе не перечисляй, если посетитель не просит конкретную модель/артикул.
- Конкретный запрос (артикул, точное название модели) — опирайся на позиции: название, SKU, цена, ссылка на карточку.
- Если блок говорит, что позиций не найдено — честно скажи, что такого товара в каталоге нет, предложи уточнить запрос, /request или оператора.
- Не выдумывай наличие на складе и скидки. Ссылки только из блока КАТАЛОГ.

Правила ответа:
- Отвечай по-русски, коротко и по делу (1–5 предложений).
- На приветствие (в т.ч. с опечаткой вроде «привте», «здраствуйте») — поприветствуй и предложи помочь с подбором оборудования. Не пиши про каталог.
- Если фраза непонятна и блока КАТАЛОГ нет — коротко переспроси, чем помочь; не говори, что «в каталоге ничего не найдено».
- Если посетитель хочет оформить заказ / купить / выставить счёт / коммерческое предложение — вежливо подтверди и поставь escalate=true, escalateReason="order".
- Если настойчиво просит живого оператора / человека / менеджера (в т.ч. чтобы согласовать доставку) — escalate=true, escalateReason="human".
- В остальных случаях escalate=false и escalateReason=null.

Ответ СТРОГО одним JSON-объектом без markdown:
{"reply":"текст посетителю","escalate":false,"escalateReason":null}`;

function getConfig(): { apiKey: string; folderId: string; model: string } | null {
  if (process.env.YANDEX_AI_CHAT === "0") return null;
  const apiKey = process.env.YANDEX_API_KEY?.trim();
  const folderId = process.env.YANDEX_FOLDER_ID?.trim();
  if (!apiKey || !folderId) return null;
  const modelName = process.env.YANDEX_MODEL?.trim() || "yandexgpt-lite/latest";
  return {
    apiKey,
    folderId,
    model: modelName.startsWith("gpt://")
      ? modelName
      : `gpt://${folderId}/${modelName}`,
  };
}

export function isYandexChatConfigured(): boolean {
  return getConfig() !== null;
}

function extractJsonObject(raw: string): unknown {
  let trimmed = raw.trim();
  if (trimmed.startsWith("```")) {
    trimmed = trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI response is not JSON");
  }
}

function normalizeResult(data: unknown): AiChatResult | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  const reply = typeof obj.reply === "string" ? obj.reply.trim() : "";
  if (!reply) return null;
  const escalate = Boolean(obj.escalate);
  let escalateReason: EscalateReason | null = null;
  if (obj.escalateReason === "order" || obj.escalateReason === "human") {
    escalateReason = obj.escalateReason;
  } else if (escalate) {
    escalateReason = "human";
  }
  return { reply: reply.slice(0, 2000), escalate, escalateReason };
}

export async function generateSupportReply(
  history: { role: "visitor" | "support"; text: string }[],
  catalogContext?: string
): Promise<AiChatResult | null> {
  const config = getConfig();
  if (!config) return null;

  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (catalogContext?.trim()) {
    messages.push({
      role: "system",
      content: catalogContext.trim(),
    });
  }

  for (const m of history.slice(-16)) {
    messages.push({
      role: m.role === "visitor" ? "user" : "assistant",
      content: m.text,
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${config.apiKey}`,
        "x-folder-id": config.folderId,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.25,
        max_tokens: 400,
        messages,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[ai] Yandex HTTP", res.status, body.slice(0, 400));
      return null;
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) return null;
    return normalizeResult(extractJsonObject(content));
  } catch (err) {
    console.error("[ai] Yandex request failed:", err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
