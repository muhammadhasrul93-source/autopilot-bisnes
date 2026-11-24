// Enjin: terima mesej masuk, draf/hantar balasan AI, publish post terjadual, polling.
import { db, save, newId, log, markSeen } from "./db.js";
import { PLATFORMS } from "./platforms/index.js";
import { draftReply, aiEnabled } from "./ai.js";
import { refreshTokens } from "./accounts.js";

/** Masukkan item baharu ke inbox dan proses ikut mode balasan. */
export async function ingest(item) {
  if (!item?.text) return;
  if (!markSeen(`${item.platform}:${item.externalId}`)) return;
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
  await processEntry(entry);
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
  if (mode === "off" || !aiEnabled()) return;
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
  save();
}

export async function sendReply(entry, text) {
  const p = PLATFORMS[entry.platform];
  if (!entry.simulated) await p.reply(entry.threadRef, text);
  entry.reply = text;
  entry.status = "sent";
  entry.repliedAt = new Date().toISOString();
  entry.error = undefined;
  save();
  log("info", `Balasan dihantar ke ${p.name} (${entry.from || entry.externalId})`);
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
      if (!p.configured()) throw new Error("Belum disambung (semak .env)");
      const caption = post.captions[key] ?? "";
      const r = await p.publish({ caption, mediaUrl: post.mediaUrl, mediaType: post.mediaType });
      post.results[key] = { ok: true, id: r.id, at: new Date().toISOString() };
      log("info", `Post "${post.title || post.brief.slice(0, 40)}" berjaya ke ${p.name}`);
    } catch (e) {
      post.results[key] = { ok: false, error: e.message, at: new Date().toISOString() };
      log("error", `Post ke ${p.name} gagal: ${e.message}`);
    }
    save();
  }
  const all = post.platforms.map((k) => post.results[k]?.ok);
  post.status = all.every(Boolean) ? "published" : all.some(Boolean) ? "partial" : "failed";
  post.publishedAt = new Date().toISOString();
  save();
  return post;
}

let lastPoll = 0;
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

export function startScheduler() {
  setTimeout(tick, 5_000);
  setInterval(tick, 30_000);
}
