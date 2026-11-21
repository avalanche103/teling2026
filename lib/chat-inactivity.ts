import {
  getChatsNeedingInactivityEmail,
  markInactivityEmailSent,
} from "@/lib/chats";
import { sendInactiveChatTranscript } from "@/lib/email";

export async function processInactiveChatsEmail(): Promise<void> {
  const chats = getChatsNeedingInactivityEmail();
  for (const chat of chats) {
    const lastMessage = chat.messages[chat.messages.length - 1];
    if (!lastMessage) continue;
    try {
      const sent = await sendInactiveChatTranscript(chat);
      if (sent) {
        markInactivityEmailSent(chat.id, lastMessage.id);
      }
    } catch (err) {
      console.error("[email] Ошибка отправки письма по неактивному диалогу:", err);
    }
  }
}
