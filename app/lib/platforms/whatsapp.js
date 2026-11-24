// WhatsApp Cloud API (Meta) — terima & balas mesej pelanggan.
// Nota: API rasmi TIDAK menyokong post ke WhatsApp Status/Channel. Mesej keluar di luar
// tetingkap 24 jam perlu guna template yang diluluskan Meta.
import { api } from "./http.js";

const V = "v21.0";
const env = () => ({ token: process.env.WHATSAPP_TOKEN, phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID });

export const whatsapp = {
  name: "WhatsApp",
  canPost: false,
  canComment: false,
  canDM: true,
  configured: () => Boolean(env().token && env().phoneId),

  async publish() {
    throw new Error("WhatsApp Cloud API tidak menyokong post Status/Channel. Guna untuk balas DM sahaja.");
  },

  async reply(threadRef, text) {
    await api(`https://graph.facebook.com/${V}/${env().phoneId}/messages`, {
      method: "POST",
      token: env().token,
      body: {
        messaging_product: "whatsapp",
        to: threadRef.waId,
        type: "text",
        text: { body: text },
        context: threadRef.messageId ? { message_id: threadRef.messageId } : undefined,
      },
    });
  },

  /** Webhook Meta object=whatsapp_business_account */
  parseWebhook(body) {
    const items = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const v = change.value ?? {};
        const names = Object.fromEntries((v.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
        for (const m of v.messages ?? []) {
          if (m.type !== "text") continue;
          items.push({
            platform: "whatsapp",
            kind: "dm",
            externalId: m.id,
            threadRef: { waId: m.from, messageId: m.id },
            from: `${names[m.from] || ""} +${m.from}`.trim(),
            text: m.text.body,
          });
        }
      }
    }
    return items;
  },
};
