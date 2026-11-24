// Telegram Bot API — post ke channel, balas DM & komen (kumpulan perbincangan channel).
import { api } from "./http.js";
import { account } from "../accounts.js";

const env = () => {
  const a = account("telegram");
  return { token: a?.botToken || process.env.TELEGRAM_BOT_TOKEN, channel: a?.channelId || process.env.TELEGRAM_CHANNEL_ID, username: a?.botUsername };
};
const call = (method, body, token = env().token) => api(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body });

export const telegram = {
  name: "Telegram",
  canPost: true,
  canComment: true,
  canDM: true,
  configured: () => Boolean(env().token),
  accountLabel: () => env().username && `@${env().username}`,
  token: () => env().token,

  /** Sahkan token bot & channel sebelum disimpan. */
  async verify(botToken, channelId) {
    const me = await call("getMe", {}, botToken);
    if (channelId) await call("getChat", { chat_id: channelId }, botToken);
    return me.result.username;
  },

  async publish({ caption, mediaUrl, mediaType }) {
    const chat_id = env().channel;
    if (!chat_id) throw new Error("Channel Telegram belum diset");
    let r;
    if (mediaUrl && mediaType === "video") r = await call("sendVideo", { chat_id, video: mediaUrl, caption: caption.slice(0, 1024) });
    else if (mediaUrl) r = await call("sendPhoto", { chat_id, photo: mediaUrl, caption: caption.slice(0, 1024) });
    else r = await call("sendMessage", { chat_id, text: caption.slice(0, 4096) });
    return { id: String(r.result.message_id) };
  },

  /** Balas: threadRef = {chatId, messageId} */
  async reply(threadRef, text) {
    await call("sendMessage", {
      chat_id: threadRef.chatId,
      text,
      reply_parameters: { message_id: threadRef.messageId, allow_sending_without_reply: true },
    });
  },

  async setWebhook(publicUrl, secret) {
    return call("setWebhook", {
      url: `${publicUrl}/webhook/telegram`,
      secret_token: secret,
      allowed_updates: ["message"],
    });
  },

  /** Tukar update webhook kepada item inbox (atau null). */
  parseUpdate(update) {
    const m = update.message;
    if (!m?.text || m.from?.is_bot) return null;
    // Abaikan post channel yang auto-forward ke kumpulan perbincangan
    if (m.is_automatic_forward) return null;
    const isDM = m.chat.type === "private";
    // Dalam kumpulan, hanya layan balasan kepada post channel (iaitu "komen")
    if (!isDM && !m.reply_to_message) return null;
    return {
      platform: "telegram",
      kind: isDM ? "dm" : "comment",
      externalId: `${m.chat.id}:${m.message_id}`,
      threadRef: { chatId: m.chat.id, messageId: m.message_id },
      from: [m.from?.first_name, m.from?.username && `@${m.from.username}`].filter(Boolean).join(" "),
      text: m.text,
    };
  },
};
