// Log masuk dashboard: kata laluan (scrypt) + sesi kuki. Persediaan kali pertama dilindungi kod persediaan.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { db, save, DATA_DIR } from "./db.js";

const SESSION_DAYS = 30;
const hash = (password, salt) => crypto.scryptSync(password, salt, 64).toString("hex");
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const envPassword = () => process.env.ADMIN_PASSWORD || "";
export const hasPassword = () => Boolean(envPassword() || db().auth?.hash);
export const needsSetup = () => !hasPassword();

// Kod persediaan: hanya pemilik server (yang boleh lihat log/fail) boleh cipta kata laluan pertama
let setupCode = null;
export function ensureSetupCode() {
  if (!needsSetup()) return null;
  setupCode ??= String(crypto.randomInt(100000, 1000000));
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, "kod-persediaan.txt"), setupCode + "\n");
  return setupCode;
}

export function setPassword(password) {
  if (String(password).length < 8) throw new Error("Kata laluan minimum 8 aksara");
  const salt = crypto.randomBytes(16).toString("hex");
  db().auth = { salt, hash: hash(password, salt) };
  db().sessions = [];
  save();
  try {
    fs.rmSync(path.join(DATA_DIR, "kod-persediaan.txt"), { force: true });
  } catch {}
  setupCode = null;
}

export function setupWithCode(code, password) {
  if (!needsSetup()) throw new Error("Kata laluan sudah ditetapkan");
  if (!setupCode || !safeEqual(String(code).trim(), setupCode)) throw new Error("Kod persediaan salah");
  setPassword(password);
}

export function checkPassword(password) {
  const env = envPassword();
  if (env) return safeEqual(password, env);
  const a = db().auth;
  return Boolean(a?.hash) && safeEqual(hash(String(password), a.salt), a.hash);
}

export function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  const d = db();
  const now = Date.now();
  d.sessions = (d.sessions ?? []).filter((s) => s.exp > now).slice(-20);
  d.sessions.push({ h: sha(token), exp: now + SESSION_DAYS * 86_400_000 });
  save();
  return { token, maxAge: SESSION_DAYS * 86_400_000 };
}

export function validSession(token) {
  if (!token) return false;
  const h = sha(token);
  return (db().sessions ?? []).some((s) => s.h === h && s.exp > Date.now());
}

export function destroySession(token) {
  if (!token) return;
  const h = sha(token);
  db().sessions = (db().sessions ?? []).filter((s) => s.h !== h);
  save();
}

export function readCookie(req, name) {
  for (const part of (req.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

// Had cubaan log masuk: 10 cubaan / 15 minit setiap IP
const attempts = new Map();
export function rateLimited(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, a);
  return a.length >= 10;
}
export const recordFail = (ip) => attempts.set(ip, [...(attempts.get(ip) ?? []), Date.now()]);
