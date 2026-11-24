// Threads API — post teks/gambar/video & balas reply.
// Nota: Threads API tiada endpoint DM.
import { api, sleep } from "./http.js";

const BASE = "https://graph.threads.net/v1.0";
const env = () => ({ token: process.env.THREADS_ACCESS_TOKEN, userId: process.env.THREADS_USER_ID });

async function createAndPublish(form) {
  const { token, userId } = env();
  const c = await api(`${BASE}/${userId}/threads`, { method: "POST", token, form });
  // Meta syorkan tunggu sebelum publish (lebih lama untuk video)
  await sleep(form.media_type === "VIDEO" ? 30000 : form.media_type === "IMAGE" ? 10000 : 2000);
  const p = await api(`${BASE}/${userId}/threads_publish`, { method: "POST", token, form: { creation_id: c.id } });
  return { id: p.id };
}

export const threads = {
  name: "Threads",
  canPost: true,
  canComment: true,
  canDM: false,
  configured: () => Boolean(env().token && env().userId),

  async publish({ caption, mediaUrl, mediaType }) {
    const text = caption.slice(0, 500);
    if (mediaUrl && mediaType === "video") return createAndPublish({ media_type: "VIDEO", video_url: mediaUrl, text });
    if (mediaUrl) return createAndPublish({ media_type: "IMAGE", image_url: mediaUrl, text });
    return createAndPublish({ media_type: "TEXT", text });
  },

  async reply(threadRef, text) {
    await createAndPublish({ media_type: "TEXT", text: text.slice(0, 500), reply_to_id: threadRef.replyId });
  },

  async pollReplies(limitPosts = 5) {
    const { token, userId } = env();
    const posts = await api(`${BASE}/${userId}/threads?fields=id,text&limit=${limitPosts}`, { token });
    const items = [];
    for (const p of posts.data ?? []) {
      const rs = await api(`${BASE}/${p.id}/replies?fields=id,text,username,timestamp,is_reply_owned_by_me`, { token });
      for (const r of rs.data ?? []) {
        if (r.is_reply_owned_by_me || !r.text) continue;
        items.push({
          platform: "threads",
          kind: "comment",
          externalId: r.id,
          threadRef: { replyId: r.id, postId: p.id },
          from: r.username ? `@${r.username}` : "",
          text: r.text,
          context: p.text?.slice(0, 200),
        });
      }
    }
    return items;
  },
};
