// Stor data ringkas berasaskan fail JSON (cukup untuk satu bisnes / satu admin).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DATA_DIR = path.resolve("data");
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
      tiktok: "off",
    },
    pollMinutes: 5,
  },
  posts: [], // {id, brief, platforms, captions{}, mediaUrl, mediaType, status, scheduledAt, results{}, createdAt}
  inbox: [], // {id, platform, kind:'comment'|'dm', externalId, threadRef, from, text, receivedAt, status, draft, reply, error}
  seen: {}, // kunci id luaran yang sudah diproses
  log: [],
};

let state;

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
      },
    };
  } else {
    state = structuredClone(DEFAULTS);
  }
}
load();

let timer = null;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, FILE);
  }, 200);
}

export const db = () => state;
export const newId = () => crypto.randomUUID();

export function log(level, msg) {
  state.log.unshift({ at: new Date().toISOString(), level, msg });
  state.log = state.log.slice(0, 300);
  save();
  (level === "error" ? console.error : console.log)(`[${level}] ${msg}`);
}

/** Tanda id luaran sebagai sudah dilihat. Pulangkan true jika baru. */
export function markSeen(key) {
  if (state.seen[key]) return false;
  state.seen[key] = Date.now();
  save();
  return true;
}
