#!/usr/bin/env node
// Pemasang kit Autopilot Sosial untuk Claude Code & Claude Desktop.
// Guna: npm run pasang            (cipta ruang kerja + daftar MCP untuk Claude Code)
//       npm run pasang -- --desktop  (juga tambah ke Claude Desktop)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const KIT = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(KIT, "..");
const MCP = path.join(APP, "mcp.js");
const NODE = process.execPath;
const args = process.argv.slice(2);
const WORK = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(os.homedir(), "AutopilotSosial"));

const ok = (m) => console.log(`✅ ${m}`);
const warn = (m) => console.log(`⚠️  ${m}`);

// 1. Semak keperluan
const [maj] = process.versions.node.split(".").map(Number);
if (maj < 22) warn(`Node.js ${process.versions.node} — perlukan versi 22 ke atas`);
else ok(`Node.js ${process.versions.node}`);
try {
  execFileSync(process.env.ADB_PATH || "adb", ["version"], { stdio: "pipe" });
  ok("adb dijumpai");
} catch {
  warn("adb tidak dijumpai — pasang Android platform-tools (lihat PASANG.md) atau set ADB_PATH");
}
if (!fs.existsSync(path.join(APP, "node_modules"))) warn("Jalankan `npm install` dalam folder app dahulu");

// 2. Ruang kerja Claude Code
fs.mkdirSync(path.join(WORK, ".claude"), { recursive: true });
fs.copyFileSync(path.join(KIT, "CLAUDE.md"), path.join(WORK, "CLAUDE.md"));
const server = { type: "stdio", command: NODE, args: [MCP], env: {} };
if (process.env.ADB_PATH) server.env.ADB_PATH = process.env.ADB_PATH;
// Daftar dengan Claude Code (skop local untuk folder ini — tidak perlu kelulusan tambahan)
let registered = false;
try {
  const envArgs = Object.entries(server.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]);
  try {
    execFileSync("claude", ["mcp", "remove", "--scope", "local", "autopilot"], { cwd: WORK, stdio: "pipe", shell: process.platform === "win32" });
  } catch {}
  execFileSync("claude", ["mcp", "add", ...envArgs, "--scope", "local", "--transport", "stdio", "autopilot", "--", NODE, MCP], {
    cwd: WORK,
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  registered = true;
  ok("Pelayan MCP 'autopilot' didaftarkan dalam Claude Code");
} catch (e) {
  if (process.env.DEBUG) console.error(e.stderr?.toString() || e.message);
  // Sandaran: .mcp.json (Claude Code akan minta kelulusan sekali semasa dibuka)
  fs.writeFileSync(path.join(WORK, ".mcp.json"), JSON.stringify({ mcpServers: { autopilot: server } }, null, 2) + "\n");
  warn("Claude Code CLI tidak dijumpai — .mcp.json ditulis; luluskan pelayan 'autopilot' semasa pertama kali buka `claude`");
}
const settingsFile = path.join(WORK, ".claude", "settings.json");
const settings = fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, "utf8")) : {};
settings.permissions ??= {};
// Benarkan alat autopilot tanpa tanya setiap kali (perlu untuk /loop tanpa pengawasan).
// Buang baris ini jika anda mahu meluluskan setiap tindakan secara manual.
settings.permissions.allow = Array.from(new Set([...(settings.permissions.allow || []), "mcp__autopilot"]));
fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
ok(`Ruang kerja Claude Code: ${WORK}`);
void registered;

// 3. Claude Desktop (pilihan)
if (args.includes("--desktop")) {
  const cfgDir =
    process.platform === "darwin" ? path.join(os.homedir(), "Library", "Application Support", "Claude")
    : process.platform === "win32" ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude")
    : path.join(os.homedir(), ".config", "Claude");
  const cfgFile = path.join(cfgDir, "claude_desktop_config.json");
  fs.mkdirSync(cfgDir, { recursive: true });
  let cfg = {};
  if (fs.existsSync(cfgFile)) {
    fs.copyFileSync(cfgFile, cfgFile + ".backup");
    cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8") || "{}");
  }
  cfg.mcpServers ??= {};
  cfg.mcpServers.autopilot = { command: NODE, args: [MCP], ...(server.env.ADB_PATH ? { env: server.env } : {}) };
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n");
  ok(`Claude Desktop dikemas kini: ${cfgFile} (sandaran .backup). Tutup sepenuhnya & buka semula Claude Desktop.`);
}

console.log(`
Langkah seterusnya:
  1. Sambung telefon (USB debugging ON) dan semak:  adb devices
  2. Buka terminal di ruang kerja dan mulakan Claude:
       cd "${WORK}"
       claude
     (log masuk dengan akaun Claude anda sendiri jika diminta)
  3. Dalam Claude, taip:
       /mcp__autopilot__tetapkan_bisnes        ← isi maklumat bisnes (sekali sahaja)
       /mcp__autopilot__semak_dan_balas        ← semak & balas komen/DM
       /loop 30m /mcp__autopilot__semak_dan_balas   ← ulang setiap 30 minit
`);
