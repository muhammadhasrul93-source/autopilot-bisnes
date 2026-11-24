// Enjin: terima mesej masuk, draf/hantar balasan AI, publish post terjadual, polling.
import { db, save, newId, log, markSeen, upsert } from "./db.js";
import { PLATFORMS } from "./platforms/index.js";
import { draftReply, aiEnabled } from "./ai.js";
import { refreshTokens } from "./accounts.js";
import * as phone from "./phoneAgent.js";
import { matchQuickReply } from "./quickReplies.js";
import { generateContent } from "./ai.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { APP_DIR } from "./db.js";

const PUBLIC = () => (process.env.PUBLIC_URL || "").replace(/\/$/, "");
/** Dapatkan fail tempatan untuk media (fail muat naik sendiri, atau muat turun URL). */
async function localMediaFor(url) {
  if (!url) return null;
  const name = url.split("/uploads/")[1];
  if (name && !name.includes("..")) {
    const f = path.join(APP_DIR, "public", "uploads", path.basename(name));
    if (fs.existsSync(f)) return f;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Muat turun media gagal: ${res.status}`);
  const f = path.join(os.tmpdir(), `ap-${Date.now()}${path.extname(url.split("?")[0]) || ".jpg"}`);
  fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
  return f;
}

/** Masukkan item baharu ke inbox dan proses ikut mode balasan. */
export async function ingest(item, { defer = false } = {}) {
  if (!item?.text) return null;
  if (!markSeen(`${item.platform}:${item.externalId}`)) return null;
  const entry = {
    id: newId(),
    ...item,
    receivedAt: new Date().toISOString(),
    status: "new", // new | drafted | needs_human | sent | ignored | error
    draft: "",
    reply: "",
  };
  db().inbox.unshift(entry);
  db().inbox = db().inbox.slice(0, 2000);
  save();
  if (!defer) await processEntry(entry);
  return entry;
}

function historyFor(entry) {
  // Konteks ringkas: mesej terdahulu dalam perbualan DM yang sama
  if (entry.kind !== "dm") return entry.context ? [{ who: "Post asal", text: entry.context }] : [];
  const key = JSON.stringify(entry.threadRef.waId ?? entry.threadRef.senderId ?? entry.threadRef.chatId);
  return db()
    .inbox.filter((e) => e.id !== entry.id && e.platform === entry.platform && e.kind === "dm")
    .filter((e) => JSON.stringify(e.threadRef.waId ?? e.threadRef.senderId ?? e.threadRef.chatId) === key)
    .slice(0, 6)
    .reverse()
    .flatMap((e) => [{ who: "Pelanggan", text: e.text }, ...(e.reply ? [{ who: "Kami", text: e.reply }] : [])]);
}

export async function processEntry(entry) {
  const mode = db().settings.replyMode[entry.platform] ?? "off";
  if (mode === "off") return;
  // 1. Jawapan pantas (tanpa AI, percuma)
  const qr = matchQuickReply(entry);
  if (qr) {
    entry.draft = qr.reply;
    entry.aiNote = `Templat kata kunci: "${qr.keyword}"`;
    try {
      if (mode === "auto") await sendReply(entry, qr.reply);
      else entry.status = "drafted";
    } catch (e) {
      entry.status = "error";
      entry.error = e.message;
    }
    upsert("inbox", entry);
    return;
  }
  // 2. AI
  if (!aiEnabled()) return;
  try {
    const r = await draftReply({
      platform: entry.platform,
      kind: entry.kind,
      from: entry.from,
      text: entry.text,
      history: historyFor(entry),
    });
    entry.draft = r.reply;
    entry.aiNote = r.reason;
    if (!r.reply.trim()) entry.status = "ignored";
    else if (r.needsHuman) entry.status = "needs_human";
    else if (mode === "auto") await sendReply(entry, r.reply);
    else entry.status = "drafted";
  } catch (e) {
    entry.status = "error";
    entry.error = e.message;
    log("error", `AI/balasan ${entry.platform}: ${e.message}`);
  }
  upsert("inbox", entry);
}

export async function sendReply(entry, text) {
  const p = PLATFORMS[entry.platform];
  if (entry.simulated) {
    // tiada apa dihantar
  } else if (entry.threadRef?.via === "adb") {
    entry.status = "sending";
    upsert("inbox", entry);
    await phone.reply(entry.threadRef, text);
  } else {
    await p.reply(entry.threadRef, text);
  }
  entry.reply = text;
  entry.status = "sent";
  entry.repliedAt = new Date().toISOString();
  entry.error = undefined;
  upsert("inbox", entry);
  log("info", `Balasan dihantar ke ${p.name}${entry.threadRef?.via === "adb" ? " (telefon)" : ""} (${entry.from || entry.externalId})`);
}

/** Publish satu post ke semua platform terpilih. */
export async function publishPost(post) {
  post.status = "publishing";
  post.results ??= {};
  save();
  for (const key of post.platforms) {
    if (post.results[key]?.ok) continue;
    const p = PLATFORMS[key];
    try {
      const caption = post.captions[key] ?? "";
      const viaPhone = db().settings.connectVia?.[key] === "phone" || (!p.configured() && db().settings.connectVia?.[key] !== "api" && db().settings.adb.scanApps?.includes(key));
      let r;
      if (viaPhone) {
        r = await phone.post(key, caption, await localMediaFor(post.mediaUrl));
      } else {
        if (!p.configured()) throw new Error("Belum disambung (Persediaan → Sambung akaun)");
        r = await p.publish({ caption, mediaUrl: post.mediaUrl, mediaType: post.mediaType });
      }
      post.results[key] = { ok: true, id: r.id, at: new Date().toISOString() };
      log("info", `Post "${post.title || post.brief.slice(0, 40)}" berjaya ke ${p.name}`);
    } catch (e) {
      post.results[key] = { ok: false, error: e.message, at: new Date().toISOString() };
      log("error", `Post ke ${p.name} gagal: ${e.message}`);
    }
    upsert("posts", post);
  }
  const all = post.platforms.map((k) => post.results[k]?.ok);
  post.status = all.every(Boolean) ? "published" : all.some(Boolean) ? "partial" : "failed";
  post.publishedAt = new Date().toISOString();
  upsert("posts", post);
  return post;
}

let lastPoll = 0;
let lastAdbScan = Date.now();
let lastRefresh = 0;
let ticking = false;

async function tick() {
  if (ticking) return;
  ticking = true;
  try {
    const now = Date.now();
    for (const post of db().posts) {
      if (post.status === "scheduled" && new Date(post.scheduledAt).getTime() <= now) {
        await publishPost(post);
      }
    }
    const adbCfg = db().settings.adb;
    if (adbCfg.scanApps?.length && adbCfg.scanMinutes > 0 && !phone.busy() && now - lastAdbScan >= adbCfg.scanMinutes * 60_000) {
      lastAdbScan = now;
      scanPhone(adbCfg.scanApps); // jalan di latar belakang
    }
    await contentTick();
    if (now - lastRefresh >= 3_600_000) {
      lastRefresh = now;
      await refreshTokens();
    }
    const every = Math.max(1, Number(db().settings.pollMinutes) || 5) * 60_000;
    if (now - lastPoll >= every) {
      lastPoll = now;
      await pollAll();
    }
  } catch (e) {
    log("error", `Scheduler: ${e.message}`);
  } finally {
    ticking = false;
  }
}

/** Polling komen untuk platform yang tiada webhook (Threads) atau sebagai sandaran (Instagram). */
export async function pollAll() {
  const jobs = [];
  if (PLATFORMS.threads.configured()) jobs.push(["threads", () => PLATFORMS.threads.pollReplies()]);
  if (PLATFORMS.instagram.configured()) jobs.push(["instagram", () => PLATFORMS.instagram.pollComments()]);
  if (PLATFORMS.tiktok.commentsConnected()) jobs.push(["tiktok", () => PLATFORMS.tiktok.pollComments()]);
  for (const [name, fn] of jobs) {
    try {
      const items = await fn();
      db().polledOnce ??= {};
      if (!db().polledOnce[name]) {
        // Kali pertama: tanda komen sedia ada sebagai "dilihat" sahaja, supaya komen lama tidak dibalas beramai-ramai
        for (const it of items) markSeen(`${it.platform}:${it.externalId}`);
        db().polledOnce[name] = true;
        save();
        log("info", `${name}: ${items.length} komen sedia ada ditanda sebagai sudah dilihat`);
        continue;
      }
      for (const it of items) await ingest(it);
    } catch (e) {
      log("error", `Polling ${name}: ${e.message}`);
    }
  }
}

/** Imbas app pada telefon melalui ADB dan masukkan mesej ke inbox. */
export async function scanPhone(apps) {
  for (const app of apps) {
    // Proses (draf/auto-balas) SELEPAS imbasan tamat — telefon hanya boleh buat satu tugas pada satu masa
    const found = [];
    try {
      await phone.scan(app, async (item) => {
        const e = await ingest(item, { defer: true });
        if (e) found.push(e);
        return Boolean(e);
      });
    } catch (e) {
      log("error", `Imbas telefon ${app}: ${e.message}`);
    }
    for (const e of found) await processEntry(e);
  }
}

// ---------------------------------------------------------------------------
// Autopilot kandungan
// ---------------------------------------------------------------------------
const NEEDS_MEDIA = new Set(["instagram", "tiktok"]);

function localNow(tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value])
  );
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[parts.weekday];
  return { date: `${parts.year}-${parts.month}-${parts.day}`, day: wd, hm: `${parts.hour}:${parts.minute}` };
}

function nextMedia() {
  const list = db().media ?? [];
  return [...list].filter((m) => !m.usedAt).sort((a, b) => a.addedAt.localeCompare(b.addedAt))[0] ?? null;
}

/** Jana satu post autopilot sekarang (dipanggil oleh penjadual atau butang "Jana sekarang"). */
export async function runContentAutopilot({ force = false } = {}) {
  const c = db().settings.contentAuto;
  if (!c.platforms?.length) throw new Error("Pilih platform untuk autopilot kandungan");
  if (!aiEnabled()) throw new Error("Autopilot kandungan perlukan Claude API key (Persediaan → AI)");
  const media = nextMedia();
  const platforms = c.platforms.filter((p) => media || !NEEDS_MEDIA.has(p));
  const skipped = c.platforms.filter((p) => !platforms.includes(p));
  if (!platforms.length) throw new Error("Tiada media dalam pustaka untuk Instagram/TikTok — muat naik gambar/video dahulu");

  const pillars = String(c.pillars || "tips berguna, cerita di sebalik tabir, testimoni sebenar, promosi produk").split(",").map((s) => s.trim()).filter(Boolean);
  const recent = db().posts.filter((p) => p.auto).slice(0, 10);
  const pillar = pillars[recent.length % pillars.length];
  const g = await generateContent({
    brief: `Post bertema "${pillar}" untuk bisnes ini${media ? ` (media: ${media.type === "video" ? "video" : "gambar"} bertajuk "${media.name}")` : ""}.`,
    platforms,
    extra: recent.length ? `Jangan ulang idea post terkini: ${recent.map((p) => p.title).join(" | ")}` : "",
  });
  const post = {
    id: newId(),
    title: g.idea.slice(0, 80),
    brief: `Autopilot: ${pillar}`,
    platforms,
    captions: g.captions,
    mediaUrl: media?.url || "",
    mediaType: media?.type || "image",
    status: c.mode === "auto" ? "publishing" : "pending_approval",
    auto: true,
    visualIdea: g.visualIdea,
    results: {},
    createdAt: new Date().toISOString(),
  };
  if (media) media.usedAt = new Date().toISOString();
  db().posts.unshift(post);
  save();
  log("info", `Autopilot kandungan: "${post.title}" ${c.mode === "auto" ? "sedang diterbitkan" : "menunggu kelulusan"}${skipped.length ? ` (dilangkau ${skipped.join(", ")}: tiada media)` : ""}`);
  if (c.mode === "auto") await publishPost(post);
  return post;
}

async function contentTick() {
  const c = db().settings.contentAuto;
  if (!c.enabled || !c.platforms?.length) return;
  const now = localNow(c.timezone || "Asia/Kuala_Lumpur");
  if (!c.days.includes(now.day) || now.hm < c.time || c.lastRunDate === now.date) return;
  c.lastRunDate = now.date;
  save();
  try {
    await runContentAutopilot();
  } catch (e) {
    log("error", `Autopilot kandungan: ${e.message}`);
  }
}

export function startScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, 30_000);
}
