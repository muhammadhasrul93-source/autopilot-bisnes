// Jawapan pantas berasaskan kata kunci — dibalas TANPA AI (kos sifar).
import { db } from "./db.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Cari templat pertama yang sepadan dengan mesej. Pulangkan {keywords, reply} atau null. */
export function matchQuickReply({ platform, kind, text }) {
  const t = norm(text);
  for (const q of db().settings.quickReplies ?? []) {
    if (!q.reply?.trim()) continue;
    if (q.kind && q.kind !== "all" && q.kind !== kind) continue;
    if (q.platforms?.length && !q.platforms.includes(platform)) continue;
    const kws = String(q.keywords || "")
      .split(",")
      .map((k) => norm(k).trim())
      .filter(Boolean);
    // Padan di awal perkataan, supaya akhiran Melayu (harganya, hargakah) turut dikira
    const hit = kws.find((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(k)}`, "u").test(t));
    if (hit) return { keyword: hit, keywords: q.keywords, reply: q.reply.trim() };
  }
  return null;
}

/** Bersihkan input templat daripada pengguna. */
export function sanitizeQuickReplies(list) {
  return (Array.isArray(list) ? list : [])
    .map((q) => ({
      keywords: String(q.keywords || "").slice(0, 300),
      reply: String(q.reply || "").slice(0, 2000),
      kind: ["all", "comment", "dm"].includes(q.kind) ? q.kind : "all",
      platforms: Array.isArray(q.platforms) ? q.platforms.map(String) : [],
    }))
    .filter((q) => q.keywords.trim() && q.reply.trim())
    .slice(0, 100);
}
