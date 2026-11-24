// Stor data ringkas berasaskan fail JSON (cukup untuk satu bisnes / satu admin).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// Folder data tetap (relatif kepada folder app), boleh ditukar dengan AUTOPILOT_DATA_DIR.
// App web dan pelayan MCP berkongsi fail yang sama.
export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = process.env.AUTOPILOT_DATA_DIR ? path.resolve(process.env.AUTOPILOT_DATA_DIR) : path.join(APP_DIR, "data");
const FILE = path.join(DATA_DIR, "db.json");

const DEFAULTS = {
  settings: {
    brandName: "",
    brandVoice:
      "Mesra, santai, Bahasa Melayu Malaysia. Ringkas, jelas, ada call-to-action. Elak janji melampau.",
    businessInfo: "",
    // mode balasan: "off" | "approve" (AI draf, admin luluskan) | "auto" (AI terus hantar)
    replyMode: {
      telegram: "approve",
      whatsapp: "approve",
      instagram: "approve",
      threads: "approve",
      tiktok: "approve",
    },
    pollMinutes: 5,
    // Ejen Telefon (ADB)
    adb: { serial: "", scanApps: [], scanMinutes: 60, useAdbKeyboard: false, screenshotMode: "auto" },
    // Jawapan pantas tanpa AI: [{ keywords: "harga, price", reply: "...", kind: "all"|"comment"|"dm", platforms: [] }]
    quickReplies: [],
    // Model ikut tugas (kosong = lalai / .env)
    models: { reply: "", phone: "", content: "" },
  },
  posts: [], // {id, brief, platforms, captions{}, mediaUrl, mediaType, status, scheduledAt, results{}, createdAt}
  inbox: [], // {id, platform, kind:'comment'|'dm', externalId, threadRef, from, text, receivedAt, status, draft, reply, error}
  seen: {}, // kunci id luaran yang sudah diproses
  log: [],
  adbRuns: [],
};

let state;
let loadedMtime = 0;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf8"));
    state = {
      ...structuredClone(DEFAULTS),
      ...raw,
      settings: {
        ...DEFAULTS.settings,
        ...raw.settings,
        replyMode: { ...DEFAULTS.settings.replyMode, ...raw.settings?.replyMode },
        adb: { ...DEFAULTS.settings.adb, ...raw.settings?.adb },
        models: { ...DEFAULTS.settings.models, ...raw.settings?.models },
      },
    };
  } else {
    state = structuredClone(DEFAULTS);
  }
  loadedMtime = mtime();
}
const mtime = () => {
  try {
    return fs.statSync(FILE).mtimeMs;
  } catch {
    return 0;
  }
};
load();

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
    loadedMtime = mtime();
    timer = null;
  }, 200);
}

/** Tulis serta-merta (digunakan oleh pelayan MCP sebelum memulangkan hasil). */
export function flush() {
  if (!timer) return;
  clearTimeout(timer);
  timer = null;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, FILE);
  loadedMtime = mtime();
}

export const db = () => {
  // Proses lain (app web / pelayan MCP) mungkin telah mengemas kini fail — muat semula jika tiada perubahan tertunda
  if (!timer && mtime() > loadedMtime) load();
  return state;
};
/** Pastikan objek (cth entri inbox) wujud dalam keadaan semasa selepas operasi async yang lama. */
export function upsert(collection, obj) {
  const list = db()[collection];
  const i = list.findIndex((x) => x.id === obj.id);
  if (i === -1) list.unshift(obj);
  else if (list[i] !== obj) list[i] = obj;
  save();
}

export const newId = () => crypto.randomUUID();

export function log(level, msg) {
  db().log.unshift({ at: new Date().toISOString(), level, msg });
  state.log = state.log.slice(0, 300);
  save();
  // stderr sahaja: stdout digunakan oleh protokol MCP
  console.error(`[${level}] ${msg}`);
}

/** Tanda id luaran sebagai sudah dilihat. Pulangkan true jika baru. */
export function markSeen(key) {
  const d = db();
  if (d.seen[key]) return false;
  d.seen[key] = Date.now();
  save();
  return true;
}
