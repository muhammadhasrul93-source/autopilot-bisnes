// Instagram API (Instagram Login) — post gambar/Reels, balas komen & DM.
import { api, sleep } from "./http.js";

const BASE = "https://graph.instagram.com/v21.0";
const env = () => ({ token: process.env.INSTAGRAM_ACCESS_TOKEN, userId: process.env.INSTAGRAM_USER_ID });

async function waitReady(containerId) {
  for (let i = 0; i < 30; i++) {
    const s = await api(`${BASE}/${containerId}?fields=status_code`, { token: env().token });
    if (s.status_code === "FINISHED") return;
    if (s.status_code === "ERROR" || s.status_code === "EXPIRED") throw new Error(`Container IG gagal: ${s.status_code}`);
    await sleep(5000);
  }
  throw new Error("Container IG mengambil masa terlalu lama");
}

export const instagram = {
  name: "Instagram",
  canPost: true,
  canComment: true,
  canDM: true,
  configured: () => Boolean(env().token && env().userId),

  async publish({ caption, mediaUrl, mediaType }) {
    if (!mediaUrl) throw new Error("Instagram perlukan gambar atau video (URL awam).");
    const { token, userId } = env();
    const form =
      mediaType === "video"
        ? { media_type: "REELS", video_url: mediaUrl, caption }
        : { image_url: mediaUrl, caption };
    const c = await api(`${BASE}/${userId}/media`, { method: "POST", token, form });
    await waitReady(c.id);
    const p = await api(`${BASE}/${userId}/media_publish`, { method: "POST", token, form: { creation_id: c.id } });
    return { id: p.id };
  },

  async reply(threadRef, text) {
    const { token, userId } = env();
    if (threadRef.commentId) {
      await api(`${BASE}/${threadRef.commentId}/replies`, { method: "POST", token, form: { message: text } });
    } else {
      await api(`${BASE}/${userId}/messages`, {
        method: "POST",
        token,
        body: { recipient: { id: threadRef.senderId }, message: { text } },
      });
    }
  },

  /** Tarik komen terbaru dari post terkini (sandaran jika webhook tidak diset). */
  async pollComments(limitMedia = 5) {
    const { token, userId } = env();
    const media = await api(`${BASE}/${userId}/media?fields=id,caption&limit=${limitMedia}`, { token });
    const items = [];
    for (const m of media.data ?? []) {
      const cs = await api(`${BASE}/${m.id}/comments?fields=id,text,username,timestamp,from&limit=50`, { token });
      for (const c of cs.data ?? []) {
        if (c.from?.id === userId) continue;
        items.push({
          platform: "instagram",
          kind: "comment",
          externalId: c.id,
          threadRef: { commentId: c.id, mediaId: m.id },
          from: c.username ? `@${c.username}` : "",
          text: c.text,
          context: m.caption?.slice(0, 200),
        });
      }
    }
    return items;
  },

  /** Webhook Meta object=instagram (field: comments, messages) */
  parseWebhook(body) {
    const items = [];
    const me = env().userId;
    for (const entry of body.entry ?? []) {
      for (const ev of entry.messaging ?? []) {
        if (!ev.message?.text || ev.message.is_echo || ev.sender?.id === me) continue;
        items.push({
          platform: "instagram",
          kind: "dm",
          externalId: ev.message.mid,
          threadRef: { senderId: ev.sender.id },
          from: ev.sender.id,
          text: ev.message.text,
        });
      }
      for (const ch of entry.changes ?? []) {
        if (ch.field !== "comments") continue;
        const v = ch.value;
        if (v.from?.id === me) continue;
        items.push({
          platform: "instagram",
          kind: "comment",
          externalId: v.id,
          threadRef: { commentId: v.id, mediaId: v.media?.id },
          from: v.from?.username ? `@${v.from.username}` : "",
          text: v.text,
        });
      }
    }
    return items;
  },
};
