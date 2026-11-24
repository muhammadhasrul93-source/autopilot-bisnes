// Rahsia (API key, App ID/Secret) boleh diisi melalui wizard; disimpan dalam data/db.json.
// Nilai dalam .env tetap digunakan jika tiada dalam UI.
import { db, save } from "./db.js";

export const SECRET_KEYS = {
  ANTHROPIC_API_KEY: "Claude API key",
  INSTAGRAM_APP_ID: "Instagram App ID",
  INSTAGRAM_APP_SECRET: "Instagram App Secret",
  THREADS_APP_ID: "Threads App ID",
  THREADS_APP_SECRET: "Threads App Secret",
  TIKTOK_CLIENT_KEY: "TikTok Client Key",
  TIKTOK_CLIENT_SECRET: "TikTok Client Secret",
  TIKTOK_BIZ_APP_ID: "TikTok Business App ID",
  TIKTOK_BIZ_APP_SECRET: "TikTok Business App Secret",
};

export function secret(name) {
  return db().secrets?.[name] || process.env[name] || "";
}

export function setSecrets(values) {
  const d = db();
  d.secrets ??= {};
  for (const [k, v] of Object.entries(values ?? {})) {
    if (!(k in SECRET_KEYS)) continue;
    const val = String(v ?? "").trim();
    if (val) d.secrets[k] = val;
    else delete d.secrets[k];
  }
  save();
}

/** Untuk UI: hanya tunjuk sama ada diset & 4 aksara terakhir. */
export function secretStatus() {
  return Object.fromEntries(
    Object.entries(SECRET_KEYS).map(([k, label]) => {
      const v = secret(k);
      return [k, { label, set: Boolean(v), hint: v ? `…${v.slice(-4)}` : "", source: db().secrets?.[k] ? "ui" : v ? "env" : "" }];
    })
  );
}
