import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, save, newId, log, APP_DIR } from "./lib/db.js";
import { PLATFORMS } from "./lib/platforms/index.js";
import { generateContent, generateIdeas, aiEnabled } from "./lib/ai.js";
import { ingest, sendReply, processEntry, publishPost, pollAll, startScheduler, scanPhone } from "./lib/engine.js";
import * as adb from "./lib/adb.js";
import * as phone from "./lib/phoneAgent.js";
import { authorizeUrl, handleCallback, oauthReady, setAccount, removeAccount } from "./lib/accounts.js";

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// Rahsia webhook Telegram diterbitkan dari token bot (stabil merentas restart)
const tgSecret = () =>
  crypto.createHash("sha256").update(`tg:${PLATFORMS.telegram.token() || ""}`).digest("hex").slice(0, 32);

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// ---------- Webhook (awam, tanpa login) ----------
app.post("/webhook/telegram", express.json(), async (req, res) => {
  if (!PLATFORMS.telegram.token() || !safeEqual(req.get("X-Telegram-Bot-Api-Secret-Token") || "", tgSecret())) return res.sendStatus(401);
  res.sendStatus(200);
  try {
    const item = PLATFORMS.telegram.parseUpdate(req.body);
    if (item) await ingest(item);
  } catch (e) {
    log("error", `Webhook Telegram: ${e.message}`);
  }
});

app.get("/webhook/meta", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && process.env.META_VERIFY_TOKEN && req.query["hub.verify_token"] === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook/meta", express.raw({ type: "*/*" }), async (req, res) => {
  const secret = process.env.META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET;
  if (secret) {
    const sig = req.get("X-Hub-Signature-256") || "";
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(req.body).digest("hex");
    if (!safeEqual(sig, expected)) return res.sendStatus(401);
  }
  res.sendStatus(200);
  try {
    const body = JSON.parse(req.body.toString("utf8"));
    const items = body.object === "instagram" ? PLATFORMS.instagram.parseWebhook(body) : [];
    for (const it of items) await ingest(it);
  } catch (e) {
    log("error", `Webhook Meta: ${e.message}`);
  }
});

// Fail media yang dimuat naik mesti boleh diakses awam (IG/Threads/TikTok tarik dari URL)
app.use("/uploads", express.static(path.join(APP_DIR, "public/uploads")));

// ---------- OAuth callback (dilindungi oleh parameter state, bukan Basic Auth) ----------
const resultPage = (ok, msg) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;padding:40px;text-align:center">
<h2>${ok ? "✅ Berjaya disambung" : "❌ Gagal menyambung"}</h2><p>${String(msg).replace(/[<>&]/g, "")}</p>
<p><a href="/#accounts">Kembali ke dashboard</a></p>
<script>if (window.opener) { window.opener.postMessage("oauth-done", location.origin); setTimeout(() => window.close(), 1500); }</script>`;

app.get("/oauth/:platform/callback", async (req, res) => {
  try {
    const who = await handleCallback(req.params.platform, req.query);
    const name = PLATFORMS[req.params.platform]?.name || "TikTok";
    log("info", `${name} disambung (${who})`);
    res.send(resultPage(true, `${name}: ${who}`));
  } catch (e) {
    log("error", `OAuth ${req.params.platform}: ${e.message}`);
    res.status(400).send(resultPage(false, e.message));
  }
});

// ---------- Login (Basic Auth) untuk dashboard & API ----------
app.use((req, res, next) => {
  if (!ADMIN_PASSWORD) return next();
  const [type, b64] = (req.get("Authorization") || "").split(" ");
  const [, pass] = type === "Basic" ? Buffer.from(b64 || "", "base64").toString().split(/:(.*)/s) : [];
  if (pass && safeEqual(pass, ADMIN_PASSWORD)) return next();
  res.set("WWW-Authenticate", 'Basic realm="Autopilot Sosial"').sendStatus(401);
});

app.use(express.static(path.join(APP_DIR, "public")));
app.use("/api", express.json({ limit: "1mb" }));

const wrap = (fn) => (req, res) =>
  Promise.resolve().then(() => fn(req, res)).catch((e) => {
    log("error", `${req.method} ${req.path}: ${e.message}`);
    res.status(400).json({ error: e.message });
  });

app.get("/api/status", (req, res) => {
  const d = db();
  res.json({
    publicUrl: PUBLIC_URL,
    ai: aiEnabled(),
    authProtected: Boolean(ADMIN_PASSWORD),
    platforms: Object.fromEntries(
      Object.entries(PLATFORMS).map(([k, p]) => [
        k,
        {
          name: p.name,
          configured: p.configured(),
          account: p.accountLabel?.() || "",
          canPost: p.canPost,
          canComment: p.canComment,
          canDM: p.canDM,
          connect: p.oauth ? "oauth" : p.device ? "device" : "token",
          oauthReady: p.oauth ? oauthReady(k) : undefined,
          ...(k === "tiktok" ? { commentsConnected: p.commentsConnected(), commentsOauthReady: oauthReady("tiktokBiz") } : {}),
        },
      ])
    ),
    counts: {
      scheduled: d.posts.filter((p) => p.status === "scheduled").length,
      published: d.posts.filter((p) => p.status === "published").length,
      pending: d.inbox.filter((e) => ["drafted", "needs_human", "new", "error"].includes(e.status)).length,
      sentToday: d.inbox.filter((e) => e.status === "sent" && e.repliedAt?.slice(0, 10) === new Date().toISOString().slice(0, 10)).length,
    },
    log: d.log.slice(0, 50),
  });
});

app.get("/api/settings", (req, res) => res.json(db().settings));
app.put("/api/settings", wrap((req, res) => {
  const s = db().settings;
  const b = req.body;
  for (const k of ["brandName", "brandVoice", "businessInfo"]) if (typeof b[k] === "string") s[k] = b[k];
  if (b.pollMinutes) s.pollMinutes = Math.max(1, Number(b.pollMinutes));
  if (b.adb) {
    const a = s.adb;
    if (Array.isArray(b.adb.scanApps)) a.scanApps = b.adb.scanApps.filter((x) => adb.APPS[x]);
    if (b.adb.scanMinutes !== undefined) a.scanMinutes = Math.max(0, Number(b.adb.scanMinutes) || 0);
    if (b.adb.useAdbKeyboard !== undefined) a.useAdbKeyboard = Boolean(b.adb.useAdbKeyboard);
  }
  if (b.replyMode) {
    for (const [k, v] of Object.entries(b.replyMode)) {
      if (k in s.replyMode && ["off", "approve", "auto"].includes(v)) s.replyMode[k] = v;
    }
  }
  save();
  res.json(s);
}));

// ---------- Kandungan ----------
app.post("/api/generate", wrap(async (req, res) => {
  const { brief, platforms, extra } = req.body;
  if (!brief) throw new Error("Brief diperlukan");
  const list = (platforms ?? []).filter((p) => PLATFORMS[p]);
  if (!list.length) throw new Error("Pilih sekurang-kurangnya satu platform");
  res.json(await generateContent({ brief, platforms: list, extra }));
}));

app.post("/api/ideas", wrap(async (req, res) => {
  res.json({ ideas: await generateIdeas({ topic: req.body.topic, count: Math.min(30, Number(req.body.count) || 7) }) });
}));

app.post("/api/upload", express.raw({ type: ["image/*", "video/*"], limit: "200mb" }), wrap((req, res) => {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" }[req.get("Content-Type")];
  if (!ext || !req.body?.length) throw new Error("Format tidak disokong (JPG, PNG, WEBP, MP4, MOV)");
  const dir = path.join(APP_DIR, "public/uploads");
  fs.mkdirSync(dir, { recursive: true });
  const name = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, name), req.body);
  res.json({ url: `${PUBLIC_URL}/uploads/${name}`, mediaType: req.get("Content-Type").startsWith("video") ? "video" : "image" });
}));

app.get("/api/posts", (req, res) => res.json(db().posts));

app.post("/api/posts", wrap(async (req, res) => {
  const { title, brief, platforms, captions, mediaUrl, mediaType, scheduledAt, publishNow } = req.body;
  const list = (platforms ?? []).filter((p) => PLATFORMS[p]?.canPost);
  if (!list.length) throw new Error("Pilih platform yang menyokong post");
  const post = {
    id: newId(),
    title: title || "",
    brief: brief || "",
    platforms: list,
    captions: captions || {},
    mediaUrl: mediaUrl || "",
    mediaType: mediaType === "video" ? "video" : "image",
    status: publishNow ? "publishing" : scheduledAt ? "scheduled" : "draft",
    scheduledAt: scheduledAt || null,
    results: {},
    createdAt: new Date().toISOString(),
  };
  db().posts.unshift(post);
  save();
  if (publishNow) await publishPost(post);
  res.json(post);
}));

app.put("/api/posts/:id", wrap((req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  if (!post) throw new Error("Post tidak dijumpai");
  if (["publishing", "published"].includes(post.status)) throw new Error("Post sudah diterbitkan");
  for (const k of ["title", "captions", "mediaUrl", "mediaType", "scheduledAt"]) if (k in req.body) post[k] = req.body[k];
  if (req.body.platforms) post.platforms = req.body.platforms.filter((p) => PLATFORMS[p]?.canPost);
  post.status = post.scheduledAt ? "scheduled" : "draft";
  save();
  res.json(post);
}));

app.post("/api/posts/:id/publish", wrap(async (req, res) => {
  const post = db().posts.find((p) => p.id === req.params.id);
  if (!post) throw new Error("Post tidak dijumpai");
  res.json(await publishPost(post));
}));

app.delete("/api/posts/:id", (req, res) => {
  db().posts = db().posts.filter((p) => p.id !== req.params.id);
  save();
  res.json({ ok: true });
});

// ---------- Inbox (komen & DM) ----------
app.get("/api/inbox", (req, res) => {
  const { status, platform } = req.query;
  let list = db().inbox;
  if (platform) list = list.filter((e) => e.platform === platform);
  if (status === "pending") list = list.filter((e) => ["new", "drafted", "needs_human", "error", "sending"].includes(e.status));
  else if (status) list = list.filter((e) => e.status === status);
  res.json(list.slice(0, 300));
});

const findEntry = (id) => {
  const e = db().inbox.find((x) => x.id === id);
  if (!e) throw new Error("Mesej tidak dijumpai");
  return e;
};

app.post("/api/inbox/:id/send", wrap(async (req, res) => {
  const e = findEntry(req.params.id);
  const text = (req.body.text ?? e.draft ?? "").trim();
  if (!text) throw new Error("Teks balasan kosong");
  if (e.threadRef?.via === "adb") {
    // Ejen telefon boleh ambil masa beberapa minit — jalankan di latar belakang
    sendReply(e, text).catch((err) => {
      e.status = "error";
      e.error = err.message;
      save();
    });
    return res.json(e);
  }
  try {
    await sendReply(e, text);
  } catch (err) {
    e.status = "error";
    e.error = err.message;
    save();
    throw err;
  }
  res.json(e);
}));

app.post("/api/inbox/:id/redraft", wrap(async (req, res) => {
  const e = findEntry(req.params.id);
  const mode = db().settings.replyMode[e.platform];
  if (mode === "off") db().settings.replyMode[e.platform] = "approve";
  await processEntry(e);
  if (mode === "off") db().settings.replyMode[e.platform] = "off";
  res.json(e);
}));

app.post("/api/inbox/:id/ignore", wrap((req, res) => {
  const e = findEntry(req.params.id);
  e.status = "ignored";
  save();
  res.json(e);
}));

// Uji tanpa platform sebenar: simulasi mesej masuk
app.post("/api/inbox/simulate", wrap(async (req, res) => {
  const { platform = "telegram", kind = "dm", text, from = "Pelanggan Ujian" } = req.body;
  if (!text) throw new Error("Teks diperlukan");
  await ingest({ platform, kind, externalId: `sim-${newId()}`, threadRef: { simulated: true }, from, text, simulated: true });
  res.json(db().inbox[0]);
}));

app.post("/api/poll", wrap(async (req, res) => {
  await pollAll();
  res.json({ ok: true });
}));

// ---------- Sambung akaun ----------
app.get("/api/connect/:platform/start", wrap((req, res) => {
  res.json({ url: authorizeUrl(req.params.platform) });
}));

app.post("/api/connect/:platform/disconnect", wrap(async (req, res) => {
  const p = req.params.platform;
  if (p === "whatsapp") await PLATFORMS.whatsapp.logout();
  else removeAccount(p);
  log("info", `${PLATFORMS[p]?.name || p} diputuskan`);
  res.json({ ok: true });
}));

app.post("/api/connect/telegram", wrap(async (req, res) => {
  const botToken = String(req.body.botToken || "").trim();
  const channelId = String(req.body.channelId || "").trim();
  if (!botToken) throw new Error("Token bot diperlukan");
  const botUsername = await PLATFORMS.telegram.verify(botToken, channelId);
  setAccount("telegram", { botToken, channelId, botUsername });
  let webhook = "Webhook tidak diset (PUBLIC_URL mesti HTTPS)";
  if (PUBLIC_URL.startsWith("https://")) {
    await PLATFORMS.telegram.setWebhook(PUBLIC_URL, tgSecret());
    webhook = "Webhook disambung";
  }
  log("info", `Telegram disambung (@${botUsername})`);
  res.json({ ok: true, botUsername, webhook });
}));

// ---------- Telefon (ADB) ----------
app.get("/api/adb/devices", wrap(async (req, res) => {
  res.json({ devices: await adb.devices(), selected: db().settings.adb.serial, busy: phone.busy()?.label || null });
}));
app.post("/api/adb/pair", wrap(async (req, res) => {
  res.json({ out: await adb.pair(String(req.body.host || ""), String(req.body.code || "")) });
}));
app.post("/api/adb/connect", wrap(async (req, res) => {
  const out = await adb.connect(String(req.body.host || ""));
  if (/cannot|failed|unable/i.test(out)) throw new Error(out.trim());
  res.json({ out });
}));
app.post("/api/adb/select", wrap((req, res) => {
  db().settings.adb.serial = String(req.body.serial || "");
  save();
  res.json({ ok: true });
}));
app.get("/api/adb/screen", wrap(async (req, res) => {
  res.type("png").send(await adb.screenshot());
}));
app.get("/api/adb/apps", wrap(async (req, res) => {
  const out = {};
  for (const k of Object.keys(adb.APPS)) out[k] = await adb.installedPackage(k);
  res.json(out);
}));
app.post("/api/adb/scan", wrap((req, res) => {
  const apps = (req.body.apps ?? db().settings.adb.scanApps).filter((a) => adb.APPS[a]);
  if (!apps.length) throw new Error("Pilih sekurang-kurangnya satu app");
  scanPhone(apps);
  res.json({ ok: true, queued: apps });
}));
app.post("/api/adb/task", wrap((req, res) => {
  const instruction = String(req.body.instruction || "").trim();
  if (!instruction) throw new Error("Arahan kosong");
  phone.task(instruction).catch(() => {});
  res.json({ ok: true });
}));
app.get("/api/adb/runs", (req, res) => res.json({ busy: phone.busy()?.id || null, runs: (db().adbRuns ?? []).slice(0, 20) }));

app.get("/api/whatsapp/status", (req, res) => res.json(PLATFORMS.whatsapp.status()));
app.post("/api/whatsapp/link", wrap(async (req, res) => {
  await PLATFORMS.whatsapp.link({ phone: req.body?.phone });
  res.json(PLATFORMS.whatsapp.status());
}));

app.listen(PORT, () => {
  console.log(`Autopilot Sosial berjalan di http://localhost:${PORT}`);
  if (!ADMIN_PASSWORD) console.warn("AMARAN: ADMIN_PASSWORD tidak diset — dashboard terbuka tanpa login!");
  startScheduler();
  PLATFORMS.whatsapp.setMessageHandler(ingest);
  PLATFORMS.whatsapp.boot();
});
