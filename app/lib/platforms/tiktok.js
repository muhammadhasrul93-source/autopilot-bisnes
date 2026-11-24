// TikTok Content Posting API — post video / foto (PULL_FROM_URL).
// Nota: domain media mesti disahkan dalam TikTok Developer Portal, dan post awam
// memerlukan app yang telah diaudit. Balas komen: lihat bahagian TikTok API for Business di bawah.
import { api } from "./http.js";
import { account } from "../accounts.js";

const BASE = "https://open.tiktokapis.com/v2";
const env = () => {
  const a = account("tiktok");
  return { token: a?.accessToken || process.env.TIKTOK_ACCESS_TOKEN, privacy: process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY", username: a?.username };
};

export const tiktok = {
  name: "TikTok",
  canPost: true,
  canComment: false,
  canDM: false,
  oauth: true,
  configured: () => Boolean(env().token),
  accountLabel: () => env().username,

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
};

// ---------------------------------------------------------------------------
// Balas komen TikTok melalui TikTok API for Business ("TikTok Accounts" API).
// BETA: perlukan app di business-api.tiktok.com yang diluluskan untuk kebenaran
// Business Comment. Endpoint berdasarkan dokumentasi awam; belum diuji secara langsung.
// ---------------------------------------------------------------------------
const BIZ = "https://business-api.tiktok.com/open_api/v1.3";

async function biz(pathname, { method = "GET", query, body } = {}) {
  const a = account("tiktokBiz");
  if (!a?.accessToken) throw new Error("Akaun TikTok Bisnes (komen) belum disambung");
  const url = new URL(`${BIZ}/${pathname}`);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  const res = await fetch(url, {
    method,
    headers: { "Access-Token": a.accessToken, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  // Elak kehilangan ketepatan ID besar (snowflake) semasa JSON.parse
  const text = (await res.text()).replace(/"(comment_id|item_id|video_id|parent_comment_id)":\s*(\d{15,})/g, '"$1":"$2"');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TikTok: respons tidak sah (${res.status})`);
  }
  if (data.code !== 0) throw new Error(`TikTok ${data.code}: ${data.message}`);
  return data.data ?? {};
}

tiktok.canComment = true;
tiktok.commentsConnected = () => Boolean(account("tiktokBiz")?.accessToken);

tiktok.pollComments = async function (maxVideos = 10) {
  const businessId = account("tiktokBiz").openId;
  const v = await biz("business/video/list/", {
    query: { business_id: businessId, fields: ["item_id", "caption", "create_time"], max_count: Math.min(maxVideos, 20) },
  });
  const items = [];
  for (const video of v.videos ?? []) {
    const c = await biz("business/comment/list/", {
      query: {
        business_id: businessId,
        video_id: video.item_id,
        status: "PUBLIC",
        sort_field: "create_time",
        sort_order: "desc",
        max_count: 30,
      },
    });
    for (const cm of c.comments ?? []) {
      if (cm.owner || !cm.text) continue;
      items.push({
        platform: "tiktok",
        kind: "comment",
        externalId: String(cm.comment_id),
        threadRef: { videoId: String(video.item_id), commentId: String(cm.comment_id) },
        from: cm.username ? `@${cm.username}` : "",
        text: cm.text,
        context: video.caption?.slice(0, 200),
      });
    }
  }
  return items;
};

tiktok.reply = async function (threadRef, text) {
  // TikTok hadkan balasan komen ~150 aksara
  const chars = [...text];
  const short = chars.length > 150 ? chars.slice(0, 149).join("") + "…" : text;
  await biz("business/comment/reply/create/", {
    method: "POST",
    body: {
      business_id: account("tiktokBiz").openId,
      video_id: threadRef.videoId,
      comment_id: threadRef.commentId,
      text: short,
    },
  });
};
