// Lapisan ADB: kawal telefon Android melalui USB atau Wireless debugging.
// Perlu `adb` (Android platform-tools) dipasang pada komputer yang menjalankan app ini.
import { execFile } from "node:child_process";
import { db } from "./db.js";

const ADB = process.env.ADB_PATH || "adb";

function run(args, { binary = false, timeout = 30000, serial = true } = {}) {
  const s = serial ? db().settings.adb?.serial : null;
  const full = s ? ["-s", s, ...args] : args;
  return new Promise((resolve, reject) => {
    execFile(ADB, full, { encoding: binary ? "buffer" : "utf8", maxBuffer: 64 * 1024 * 1024, timeout }, (err, stdout, stderr) => {
      if (err) {
        const msg = (stderr && stderr.toString().trim()) || err.message;
        return reject(new Error(err.code === "ENOENT" ? "adb tidak dijumpai. Pasang Android platform-tools atau set ADB_PATH." : `adb: ${msg}`));
      }
      resolve(stdout);
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const APPS = {
  tiktok: { name: "TikTok", packages: ["com.ss.android.ugc.trill", "com.zhiliaoapp.musically"] },
  instagram: { name: "Instagram", packages: ["com.instagram.android"] },
  threads: { name: "Threads", packages: ["com.instagram.barcelona"] },
  whatsapp: { name: "WhatsApp", packages: ["com.whatsapp.w4b", "com.whatsapp"] },
  telegram: { name: "Telegram", packages: ["org.telegram.messenger", "org.telegram.messenger.web"] },
};

export async function devices() {
  const out = await run(["devices", "-l"], { serial: false });
  return out
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      const model = l.match(/model:(\S+)/)?.[1]?.replace(/_/g, " ") || "";
      return { serial, state, model };
    });
}

/** Wireless debugging: pasangkan (Android 11+) dengan kod 6 digit dari telefon */
export const pair = (hostPort, code) => run(["pair", hostPort, String(code)], { serial: false, timeout: 20000 });
export const connect = (hostPort) => run(["connect", hostPort], { serial: false, timeout: 20000 });

export async function screenSize() {
  const out = await run(["shell", "wm", "size"]);
  const m = out.match(/Override size:\s*(\d+)x(\d+)/) || out.match(/Physical size:\s*(\d+)x(\d+)/);
  return m ? { w: Number(m[1]), h: Number(m[2]) } : { w: 1080, h: 2400 };
}

export const screenshot = () => run(["exec-out", "screencap", "-p"], { binary: true });

/** Senarai elemen UI yang boleh dibaca/ditekan (dari uiautomator). Pulangkan [] jika skrin tidak stabil. */
export async function uiElements() {
  let xml = "";
  try {
    xml = await run(["exec-out", "uiautomator", "dump", "/dev/tty"], { timeout: 15000 });
    if (!xml.includes("<hierarchy")) {
      await run(["shell", "uiautomator", "dump", "/sdcard/ui.xml"], { timeout: 15000 });
      xml = await run(["exec-out", "cat", "/sdcard/ui.xml"]);
    }
  } catch {
    return [];
  }
  const out = [];
  const decode = (s) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  for (const m of xml.matchAll(/<node\b([^>]*?)\/?>/g)) {
    const a = {};
    for (const [, k, v] of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[k] = decode(v);
    const b = a.bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    if (x2 - x1 < 4 || y2 - y1 < 4) continue;
    const text = (a.text || "").trim();
    const desc = (a["content-desc"] || "").trim();
    const clickable = a.clickable === "true" || a["long-clickable"] === "true";
    const editable = a.class?.includes("EditText");
    if (!text && !desc && !clickable && !editable) continue;
    out.push({
      text: text.slice(0, 200),
      desc: desc.slice(0, 200),
      id: (a["resource-id"] || "").split("/").pop(),
      cls: (a.class || "").split(".").pop(),
      clickable,
      editable,
      x: Math.round((x1 + x2) / 2),
      y: Math.round((y1 + y2) / 2),
    });
  }
  return out.slice(0, 150);
}

export const tap = (x, y) => run(["shell", "input", "tap", String(Math.round(x)), String(Math.round(y))]);
export const swipe = (x1, y1, x2, y2, ms = 350) =>
  run(["shell", "input", "swipe", ...[x1, y1, x2, y2].map((n) => String(Math.round(n))), String(ms)]);
export const longPress = (x, y) => swipe(x, y, x, y, 800);

const KEYS = { back: "KEYCODE_BACK", home: "KEYCODE_HOME", enter: "KEYCODE_ENTER", recent: "KEYCODE_APP_SWITCH", delete: "KEYCODE_DEL" };
export const key = (k) => run(["shell", "input", "keyevent", KEYS[k] || k]);

/**
 * Taip teks. Dengan ADBKeyBoard (disyorkan) semua aksara termasuk emoji & baris baru disokong.
 * Tanpanya hanya ASCII disokong oleh `input text`.
 */
let imeCache = { at: 0, adb: false };
async function adbKeyboardActive() {
  if (db().settings.adb?.useAdbKeyboard) return true;
  if (Date.now() - imeCache.at < 60000) return imeCache.adb;
  let active = false;
  try {
    active = /adbkeyboard/i.test(await run(["shell", "settings", "get", "secure", "default_input_method"]));
  } catch {}
  imeCache = { at: Date.now(), adb: active };
  return active;
}
export const usingAdbKeyboard = adbKeyboardActive;

export async function typeText(text) {
  if (await adbKeyboardActive()) {
    const b64 = Buffer.from(text, "utf8").toString("base64");
    await run(["shell", "am", "broadcast", "-a", "ADB_INPUT_B64", "--es", "msg", b64]);
    return;
  }
  const ascii = text.normalize("NFKD").replace(/[^\x20-\x7E\n]/g, "");
  const lines = ascii.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Escape untuk shell pada peranti; ruang mesti jadi %s
    const esc = lines[i].replace(/([\\"'`$()<>|;&*~#!?\[\]{}])/g, "\\$1").replace(/ /g, "%s");
    if (esc) await run(["shell", "input", "text", esc]);
    if (i < lines.length - 1) await run(["shell", "input", "keyevent", "KEYCODE_ENTER"]);
  }
}

export async function installedPackage(app) {
  const out = await run(["shell", "pm", "list", "packages"]);
  return APPS[app]?.packages.find((p) => out.includes(`package:${p}\n`) || out.endsWith(`package:${p}`)) || null;
}

export async function openApp(app) {
  const pkg = await installedPackage(app);
  if (!pkg) throw new Error(`${APPS[app]?.name || app} tidak dipasang pada telefon`);
  await run(["shell", "monkey", "-p", pkg, "-c", "android.intent.category.LAUNCHER", "1"]);
  await sleep(2500);
  return pkg;
}

export async function wakeAndUnlockHint() {
  const out = await run(["shell", "dumpsys", "power"]);
  if (/mWakefulness=Asleep|Display Power: state=OFF/.test(out)) {
    await key("KEYCODE_WAKEUP");
    await sleep(800);
    await swipe(540, 1800, 540, 600, 300);
    await sleep(800);
  }
}

/**
 * Screenshot yang dikecilkan (JPEG) untuk dihantar kepada Claude melalui MCP.
 * Pulangkan { data, scale } — koordinat imej × scale = koordinat skrin sebenar.
 */
export async function screenshotScaled(maxWidth = 720) {
  const png = await screenshot();
  const { default: sharp } = await import("sharp");
  const img = sharp(png);
  const meta = await img.metadata();
  const width = Math.min(maxWidth, meta.width || maxWidth);
  const scale = (meta.width || width) / width;
  const data = await img.resize({ width }).jpeg({ quality: 70 }).toBuffer();
  return { data, scale, width, height: Math.round((meta.height || 0) / scale) };
}

/** Hantar fail media ke galeri telefon supaya boleh dipilih dalam app (TikTok, IG, dll). */
export async function pushMedia(localPath, name) {
  const remote = `/sdcard/DCIM/Autopilot/${name}`;
  await run(["shell", "mkdir", "-p", "/sdcard/DCIM/Autopilot"]);
  await run(["push", localPath, remote], { timeout: 300000 });
  await run(["shell", "am", "broadcast", "-a", "android.intent.action.MEDIA_SCANNER_SCAN_FILE", "-d", `file://${remote}`]).catch(() => {});
  return remote;
}

/** Senarai elemen ringkas (jimat token). scale: bahagi koordinat (untuk imej dikecilkan). */
export function formatElements(els, scale = 1) {
  return els
    .map((e, i) => {
      const label = [e.text && `"${e.text}"`, e.desc && e.desc !== e.text && `(${e.desc})`].filter(Boolean).join(" ");
      const what = label || [e.id, e.cls].filter(Boolean).join("/");
      const flag = e.editable ? " ✎" : e.clickable ? " •" : "";
      return `${i}${flag} ${what} @${Math.round(e.x / scale)},${Math.round(e.y / scale)}`;
    })
    .join("\n");
}

/** Perlu screenshot? "always" = sentiasa; selain itu hanya bila diminta atau tiada elemen teks. */
export const wantImage = (requested, els) => db().settings.adb?.screenshotMode === "always" || Boolean(requested) || els.length === 0;
