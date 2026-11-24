// Akaun yang disambung melalui OAuth (Instagram, Threads, TikTok) & token bot Telegram.
// Token disimpan dalam data/db.json (folder data/ TIDAK di-commit).
import crypto from "node:crypto";
import { db, save, log } from "./db.js";
import { secret } from "./secrets.js";

export const PUBLIC_URL = () => (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
const redirectUri = (p) => `${PUBLIC_URL()}/oauth/${p}/callback`;

export function account(platform) {
  db().accounts ??= {};
  return db().accounts[platform] ?? null;
}
export function setAccount(platform, data) {
  db().accounts ??= {};
  db().accounts[platform] = { ...data, connectedAt: new Date().toISOString() };
  save();
}
export function removeAccount(platform) {
  db().accounts ??= {};
  delete db().accounts[platform];
  save();
}

async function req(url, { method = "GET", form } = {}) {
  const res = await fetch(url, {
    method,
    headers: form ? { "Content-Type": "application/x-www-form-urlencoded" } : {},
    body: form ? new URLSearchParams(form) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error || data.error_message) {
    throw new Error(data.error_description || data.error_message || data.error?.message || data.error || res.statusText);
  }
  return data;
}

// ---------- Konfigurasi app pembangun (sekali sahaja, dalam .env) ----------
const APPS = {
  instagram: () => ({ id: secret("INSTAGRAM_APP_ID"), secret: secret("INSTAGRAM_APP_SECRET") }),
  threads: () => ({ id: secret("THREADS_APP_ID"), secret: secret("THREADS_APP_SECRET") }),
  tiktok: () => ({ id: secret("TIKTOK_CLIENT_KEY"), secret: secret("TIKTOK_CLIENT_SECRET") }),
  tiktokBiz: () => ({ id: secret("TIKTOK_BIZ_APP_ID"), secret: secret("TIKTOK_BIZ_APP_SECRET") }),
};
export const oauthReady = (p) => Boolean(APPS[p]?.().id && APPS[p]().secret);

const SCOPES = {
  instagram: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_messages",
  threads: "threads_basic,threads_content_publish,threads_read_replies,threads_manage_replies",
  tiktok: "user.info.basic,video.publish",
  tiktokBiz: "user.info.basic,user.info.username,video.list,comment.list,comment.list.manage",
};

// state OAuth (anti-CSRF), sah 10 minit
const states = new Map();

export function authorizeUrl(platform) {
  if (!oauthReady(platform)) throw new Error(`App ID/Secret ${platform} belum diset dalam .env`);
  const state = crypto.randomBytes(16).toString("hex");
  states.set(state, { platform, at: Date.now() });
  const { id } = APPS[platform]();
  const q = (o) => new URLSearchParams(o).toString();
  const common = { redirect_uri: redirectUri(platform), response_type: "code", state };
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/oauth/authorize?${q({ client_id: id, scope: SCOPES.instagram, enable_fb_login: "0", force_authentication: "1", ...common })}`;
    case "threads":
      return `https://threads.net/oauth/authorize?${q({ client_id: id, scope: SCOPES.threads, ...common })}`;
    case "tiktok":
      return `https://www.tiktok.com/v2/auth/authorize/?${q({ client_key: id, scope: SCOPES.tiktok, ...common })}`;
    case "tiktokBiz":
      return `https://www.tiktok.com/v2/auth/authorize/?${q({ client_key: id, scope: SCOPES.tiktokBiz, disable_auto_auth: "1", ...common })}`;
  }
  throw new Error("Platform tidak menyokong OAuth");
}

export async function handleCallback(platform, { code, state, error, error_description }) {
  const s = states.get(state);
  states.delete(state);
  if (!s || s.platform !== platform || Date.now() - s.at > 10 * 60_000) throw new Error("Sesi log masuk tamat atau tidak sah. Cuba lagi.");
  if (error) throw new Error(error_description || error);
  if (!code) throw new Error("Tiada kod kebenaran diterima");
  const { id, secret } = APPS[platform]();
  const redirect_uri = redirectUri(platform);

  if (platform === "instagram") {
    const short = await req("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      form: { client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri, code: code.replace(/#_$/, "") },
    });
    const shortToken = short.access_token ?? short.data?.[0]?.access_token;
    const long = await req(`https://graph.instagram.com/access_token?${new URLSearchParams({ grant_type: "ig_exchange_token", client_secret: secret, access_token: shortToken })}`);
    const me = await req(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(long.access_token)}`);
    setAccount("instagram", {
      accessToken: long.access_token,
      expiresAt: Date.now() + long.expires_in * 1000,
      userId: String(me.user_id ?? me.id),
      username: me.username,
    });
    return `@${me.username}`;
  }

  if (platform === "threads") {
    const short = await req("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      form: { client_id: id, client_secret: secret, grant_type: "authorization_code", redirect_uri, code },
    });
    const long = await req(`https://graph.threads.net/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: short.access_token })}`);
    const me = await req(`https://graph.threads.net/v1.0/me?fields=id,username&access_token=${encodeURIComponent(long.access_token)}`);
    setAccount("threads", {
      accessToken: long.access_token,
      expiresAt: Date.now() + long.expires_in * 1000,
      userId: String(me.id),
      username: me.username,
    });
    return `@${me.username}`;
  }

  if (platform === "tiktok") {
    const t = await req("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      form: { client_key: id, client_secret: secret, code, grant_type: "authorization_code", redirect_uri },
    });
    let username = "";
    try {
      const r = await fetch("https://open.tiktokapis.com/v2/user/info/?fields=display_name", { headers: { Authorization: `Bearer ${t.access_token}` } });
      username = (await r.json()).data?.user?.display_name ?? "";
    } catch {}
    setAccount("tiktok", tiktokTokenData(t, username));
    return username || "TikTok";
  }

  if (platform === "tiktokBiz") {
    const t = await bizToken({ client_id: id, client_secret: secret, grant_type: "authorization_code", auth_code: code, redirect_uri }, "oauth2/token");
    const scope = String(t.scope || "");
    if (scope && !/comment\.list\.manage/.test(scope)) throw new Error("Kebenaran urus komen tidak diberi. Log masuk semula dan benarkan semua akses.");
    setAccount("tiktokBiz", t);
    return "TikTok Bisnes (komen)";
  }
}

async function bizToken(body, path) {
  const res = await fetch(`https://business-api.tiktok.com/open_api/v1.3/tt_user/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (j.code !== 0 || !j.data?.access_token) throw new Error(`TikTok: ${j.message || res.statusText}`);
  const d = j.data;
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    openId: d.open_id,
    scope: d.scope,
    expiresAt: Date.now() + (d.expires_in ?? 86400) * 1000,
  };
}

function tiktokTokenData(t, username) {
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    refreshExpiresAt: Date.now() + t.refresh_expires_in * 1000,
    openId: t.open_id,
    username,
  };
}

/** Perbaharui token sebelum luput. Dipanggil oleh penjadual. */
export async function refreshTokens() {
  const now = Date.now();
  const DAY = 86_400_000;
  for (const p of ["instagram", "threads"]) {
    const a = account(p);
    // Token jangka panjang Meta (60 hari) boleh diperbaharui selepas 24 jam; perbaharui bila tinggal < 20 hari
    if (!a?.expiresAt || a.expiresAt - now > 20 * DAY || now - new Date(a.connectedAt).getTime() < DAY) continue;
    try {
      const url =
        p === "instagram"
          ? `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(a.accessToken)}`
          : `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(a.accessToken)}`;
      const r = await req(url);
      setAccount(p, { ...a, accessToken: r.access_token, expiresAt: now + r.expires_in * 1000 });
      log("info", `Token ${p} diperbaharui`);
    } catch (e) {
      log("error", `Gagal perbaharui token ${p}: ${e.message} — sila log masuk semula`);
    }
  }
  const b = account("tiktokBiz");
  if (b?.refreshToken && b.expiresAt - now < 2 * 3_600_000 && oauthReady("tiktokBiz")) {
    try {
      const { id, secret } = APPS.tiktokBiz();
      const r = await bizToken({ client_id: id, client_secret: secret, grant_type: "refresh_token", refresh_token: b.refreshToken }, "oauth2/refresh_token");
      setAccount("tiktokBiz", { ...r, refreshToken: r.refreshToken || b.refreshToken });
    } catch (e) {
      log("error", `Gagal perbaharui token TikTok Bisnes: ${e.message} — sila log masuk semula`);
    }
  }
  const t = account("tiktok");
  if (t?.refreshToken && t.expiresAt - now < 2 * 3_600_000 && oauthReady("tiktok")) {
    try {
      const { id, secret } = APPS.tiktok();
      const r = await req("https://open.tiktokapis.com/v2/oauth/token/", {
        method: "POST",
        form: { client_key: id, client_secret: secret, grant_type: "refresh_token", refresh_token: t.refreshToken },
      });
      setAccount("tiktok", tiktokTokenData(r, t.username));
    } catch (e) {
      log("error", `Gagal perbaharui token TikTok: ${e.message} — sila log masuk semula`);
    }
  }
}
