// TikTok Content Posting API — post video / foto (PULL_FROM_URL).
// Nota: domain media mesti disahkan dalam TikTok Developer Portal, dan post awam
// memerlukan app yang telah diaudit. API awam TikTok tidak menyokong balas komen/DM.
import { api } from "./http.js";

const BASE = "https://open.tiktokapis.com/v2";
const env = () => ({ token: process.env.TIKTOK_ACCESS_TOKEN, privacy: process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY" });

export const tiktok = {
  name: "TikTok",
  canPost: true,
  canComment: false,
  canDM: false,
  configured: () => Boolean(env().token),

  async publish({ caption, mediaUrl, mediaType }) {
    if (!mediaUrl) throw new Error("TikTok perlukan video atau gambar (URL awam pada domain yang disahkan).");
    const { token, privacy } = env();
    if (mediaType === "video") {
      const r = await api(`${BASE}/post/publish/video/init/`, {
        method: "POST",
        token,
        body: {
          post_info: { title: caption.slice(0, 2200), privacy_level: privacy },
          source_info: { source: "PULL_FROM_URL", video_url: mediaUrl },
        },
      });
      return { id: r.data?.publish_id };
    }
    const r = await api(`${BASE}/post/publish/content/init/`, {
      method: "POST",
      token,
      body: {
        media_type: "PHOTO",
        post_mode: "DIRECT_POST",
        post_info: { title: caption.slice(0, 90), description: caption.slice(0, 4000), privacy_level: privacy },
        source_info: { source: "PULL_FROM_URL", photo_images: [mediaUrl], photo_cover_index: 0 },
      },
    });
    return { id: r.data?.publish_id };
  },

  async reply() {
    throw new Error("TikTok API awam tidak menyokong balas komen/DM.");
  },
};
