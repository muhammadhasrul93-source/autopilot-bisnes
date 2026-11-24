// WhatsApp melalui "Peranti Dipautkan" (Link a device), sama seperti WhatsApp Web.
// Guna pustaka Baileys (tidak rasmi). Imbas QR atau masukkan kod pautan di telefon:
//   WhatsApp > Tetapan > Peranti dipautkan > Pautkan peranti.
// AMARAN: Ini bukan API rasmi Meta. Penggunaan automasi berlebihan (spam, mesej pukal
// kepada bukan kenalan) boleh menyebabkan nombor disekat. Guna untuk balas pelanggan sahaja.
import fs from "node:fs";
import path from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import makeWASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "baileys";
import { log } from "../db.js";
import { sleep } from "./http.js";

const AUTH_DIR = path.resolve("data/whatsapp-auth");
const logger = pino({ level: "silent" });

let sock = null;
let state = { status: "disconnected", qr: null, pairingCode: null, me: null, error: null };
let onMessage = () => {};
let wantPairingFor = null;
let stopping = false;

const hasSession = () => fs.existsSync(path.join(AUTH_DIR, "creds.json"));

function textOf(m) {
  const msg = m.message?.ephemeralMessage?.message ?? m.message?.viewOnceMessage?.message ?? m.message;
  return msg?.conversation || msg?.extendedTextMessage?.text || msg?.imageMessage?.caption || msg?.videoMessage?.caption || "";
}

async function connect() {
  stopping = false;
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  const { state: auth, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch {}
  state = { ...state, status: "connecting", error: null };

  const s = makeWASocket({
    auth,
    version,
    logger,
    browser: Browsers.macOS("Chrome"),
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });
  sock = s;
  s.ev.on("creds.update", saveCreds);

  s.ev.on("connection.update", async (u) => {
    if (s !== sock) return;
    if (u.qr) {
      if (wantPairingFor && !s.authState.creds.registered) {
        const phone = wantPairingFor;
        wantPairingFor = null;
        try {
          const code = await s.requestPairingCode(phone);
          state = { ...state, status: "pairing", pairingCode: code.match(/.{1,4}/g).join("-"), qr: null };
        } catch (e) {
          state = { ...state, error: `Gagal minta kod pautan: ${e.message}` };
        }
      } else if (!state.pairingCode) {
        state = { ...state, status: "qr", qr: await QRCode.toDataURL(u.qr, { margin: 1, width: 300 }) };
      }
    }
    if (u.connection === "open") {
      const id = s.user?.id?.split(":")[0]?.split("@")[0];
      state = { status: "open", qr: null, pairingCode: null, error: null, me: { number: id, name: s.user?.name } };
      log("info", `WhatsApp disambung sebagai +${id}`);
    }
    if (u.connection === "close") {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      sock = null;
      if (stopping) return;
      if (code === DisconnectReason.loggedOut) {
        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        state = { status: "disconnected", qr: null, pairingCode: null, me: null, error: "Peranti telah dinyahpaut dari telefon." };
        log("error", "WhatsApp dilog keluar dari telefon — sila pautkan semula");
        return;
      }
      // Sambung semula (cth selepas imbas QR, Baileys perlukan restart: kod 515)
      const reason = u.lastDisconnect?.error?.message;
      state = { ...state, status: "connecting", error: code === DisconnectReason.restartRequired ? null : reason ? `Sambungan terputus (${reason}), mencuba semula…` : null };
      setTimeout(() => connect().catch((e) => log("error", `WhatsApp: ${e.message}`)), code === DisconnectReason.restartRequired ? 500 : 5000);
    }
  });

  s.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      const jid = m.key.remoteJid || "";
      if (m.key.fromMe || jid.endsWith("@g.us") || jid.endsWith("@broadcast") || jid.endsWith("@newsletter")) continue;
      const text = textOf(m);
      if (!text) continue;
      const number = (m.key.remoteJidAlt || m.key.senderPn || jid).split("@")[0];
      try {
        await onMessage({
          platform: "whatsapp",
          kind: "dm",
          externalId: m.key.id,
          threadRef: { jid, key: m.key, text },
          from: `${m.pushName || ""} ${/^\d+$/.test(number) ? "+" + number : ""}`.trim(),
          text,
        });
      } catch (e) {
        log("error", `WhatsApp mesej masuk: ${e.message}`);
      }
    }
  });
}

export const whatsapp = {
  name: "WhatsApp",
  canPost: false,
  canComment: false,
  canDM: true,
  device: true,
  configured: () => state.status === "open",
  accountLabel: () => state.me && `+${state.me.number}${state.me.name ? ` (${state.me.name})` : ""}`,
  status: () => ({ ...state, hasSession: hasSession() }),

  setMessageHandler(fn) {
    onMessage = fn;
  },

  /** Sambung semula sesi sedia ada semasa server mula. */
  async boot() {
    if (hasSession()) await connect().catch((e) => log("error", `WhatsApp: ${e.message}`));
  },

  /** Mula proses pautan peranti: QR (lalai) atau kod pautan jika nombor telefon diberi. */
  async link({ phone } = {}) {
    if (state.status === "open") throw new Error("WhatsApp sudah disambung");
    if (sock) {
      stopping = true;
      sock.end(undefined);
      sock = null;
    }
    state = { status: "connecting", qr: null, pairingCode: null, me: null, error: null };
    wantPairingFor = phone ? String(phone).replace(/\D/g, "") : null;
    await connect();
  },

  async logout() {
    stopping = true;
    try {
      await sock?.logout();
    } catch {}
    sock = null;
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
    state = { status: "disconnected", qr: null, pairingCode: null, me: null, error: null };
  },

  async publish() {
    throw new Error("Post ke WhatsApp Status tidak disokong. WhatsApp digunakan untuk balas mesej.");
  },

  async reply(threadRef, text) {
    if (!sock || state.status !== "open") throw new Error("WhatsApp tidak disambung");
    // Tingkah laku seperti manusia: tanda dibaca, "sedang menaip", tunggu sebentar
    try {
      await sock.readMessages([threadRef.key]);
      await sock.sendPresenceUpdate("composing", threadRef.jid);
    } catch {}
    await sleep(2000 + Math.min(8000, text.length * 40) + Math.random() * 2000);
    try {
      await sock.sendPresenceUpdate("paused", threadRef.jid);
    } catch {}
    await sock.sendMessage(
      threadRef.jid,
      { text },
      { quoted: { key: threadRef.key, message: { conversation: threadRef.text } } }
    );
  },
};
