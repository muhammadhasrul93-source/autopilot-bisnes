# Link login `https://app.coachyoi.com` dengan Cloudflare Tunnel

Cloudflare Tunnel memberi app ini **link HTTPS awam** tanpa buka port router, tanpa IP tetap dan tanpa sijil SSL manual. Ia percuma.

```
Pelayar / Meta / TikTok / Telegram
        │  https://app.coachyoi.com
        ▼
   Cloudflare  ──tunnel selamat──►  cloudflared  ──►  app (localhost:3000)
                                      (komputer anda ATAU VPS)
```

| | **A. Komputer anda** | **B. VPS (Docker)** |
|---|---|---|
| Mod telefon (ADB) | ✅ (telefon disambung ke komputer) | ❌ |
| Online 24 jam | Hanya bila komputer hidup | ✅ |
| Kos | Percuma | Sewa VPS (~RM20–40/bulan) |

Kedua-duanya guna langkah 1–3 yang sama.

---

## 1. Pindahkan DNS domain ke Cloudflare (sekali sahaja)

Tunnel bernama memerlukan domain `coachyoi.com` diurus oleh Cloudflare.

1. Daftar/log masuk di <https://dash.cloudflare.com> → **Add a domain** → `coachyoi.com` → pelan **Free**.
2. Cloudflare akan mengimbas rekod DNS sedia ada. **Pastikan rekod salepage kekal:**
   - `www` → CNAME → `<username>.github.io` (GitHub Pages)
   - rekod `A` untuk `coachyoi.com` (185.199.108.153, .109.153, .110.153, .111.153), jika ada
3. Tukar **nameserver** di tempat domain dibeli (cth Exabytes, Shinjiru, Namecheap) kepada 2 nameserver yang diberi Cloudflare. Ia boleh ambil masa beberapa minit hingga 24 jam.
4. Di Cloudflare → SSL/TLS, pilih **Full**. Salepage di GitHub Pages akan terus berfungsi.

> Jika domain sudah di Cloudflare, langkau langkah ini.

## 2. Cipta tunnel

1. Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels** → **Create a tunnel**.
2. Pilih **Cloudflared**, beri nama `autopilot`, kemudian **Save**.
3. Salin **token** yang dipaparkan (rentetan panjang selepas `--token`). Simpan dengan selamat: sesiapa yang ada token ini boleh menjalankan tunnel anda.

## 3. Tetapkan alamat awam (Public Hostname)

Dalam tunnel `autopilot` → tab **Public Hostname** → **Add a public hostname**:

| Medan | Nilai |
|---|---|
| Subdomain | `app` |
| Domain | `coachyoi.com` |
| Service type | `HTTP` |
| URL | **A (komputer):** `localhost:3000`  /  **B (Docker):** `app:3000` |

Simpan. Link anda ialah **https://app.coachyoi.com**.

---

## A. Jalankan di komputer anda (Windows / Mac)

1. Pasang & sediakan app (sekali):
   ```bash
   cd autopilot-bisnes/app
   npm install
   cp .env.example .env
   ```
   Edit `.env`:
   ```
   PUBLIC_URL=https://app.coachyoi.com
   ADMIN_PASSWORD=<kata laluan kuat, min 8 aksara>
   ```
2. Pasang **cloudflared** sebagai servis (berjalan sendiri setiap kali komputer hidup):
   - Windows: muat turun `cloudflared-windows-amd64.msi` dari <https://github.com/cloudflare/cloudflared/releases>, pasang, kemudian buka **Command Prompt (Admin)**:
     ```
     cloudflared.exe service install <TOKEN>
     ```
   - Mac:
     ```bash
     brew install cloudflared
     sudo cloudflared service install <TOKEN>
     ```
   Arahan yang sama (dengan token anda) juga dipaparkan di skrin tunnel Cloudflare.
3. Jalankan app:
   ```bash
   npm start
   ```
   Untuk app berjalan sendiri di latar belakang dan mula semula jika ia terhenti:
   ```bash
   npm install -g pm2
   pm2 start npm --name autopilot -- start
   pm2 save
   ```
   Windows: `npm install -g pm2-windows-startup && pm2-startup install` supaya app mula bersama Windows.
4. Buka **https://app.coachyoi.com** dan log masuk dengan **admin** / `ADMIN_PASSWORD`.

**Cuba pantas tanpa domain:** `npm run tunnel:cuba` memberi link sementara `https://xxxx.trycloudflare.com`. Link ini bertukar setiap kali, jadi ia tidak sesuai untuk OAuth atau webhook.

## B. Jalankan di VPS dengan Docker

VPS Ubuntu (1 vCPU, 1–2 GB RAM sudah cukup) dengan Docker:

```bash
curl -fsSL https://get.docker.com | sh
git clone <URL repo ini> autopilot-bisnes
cd autopilot-bisnes/app
cp .env.example .env
nano .env          # isi PUBLIC_URL, ADMIN_PASSWORD, TUNNEL_TOKEN, ANTHROPIC_API_KEY, App ID/Secret
docker compose -f deploy/docker-compose.yml up -d --build
```

- Log: `docker compose -f deploy/docker-compose.yml logs -f`
- Kemas kini: `git pull && docker compose -f deploy/docker-compose.yml up -d --build`
- Data (`data/`, `public/uploads/`) disimpan dalam folder app pada VPS. **Backup `data/` secara berkala**, kerana ia mengandungi token akaun dan sesi WhatsApp.
- Public Hostname dalam langkah 3 mesti `app:3000`. Tiada port perlu dibuka pada VPS.

---

## 4. Selepas link berfungsi

1. **URL redirect OAuth:** daftar dalam app pembangun Meta/TikTok:
   - `https://app.coachyoi.com/oauth/instagram/callback`
   - `https://app.coachyoi.com/oauth/threads/callback`
   - `https://app.coachyoi.com/oauth/tiktok/callback`
   - `https://app.coachyoi.com/oauth/tiktokBiz/callback`
2. **Webhook Instagram (pilihan):** `https://app.coachyoi.com/webhook/meta`
3. **Telegram:** tab Akaun → Sambung Telegram. Webhook diset secara automatik ke `https://app.coachyoi.com/webhook/telegram`.

## 5. Keselamatan

- App **tidak akan berjalan** dengan `PUBLIC_URL` awam jika `ADMIN_PASSWORD` kosong atau lemah.
- (Pilihan, lebih selamat) **Cloudflare Access**: log masuk melalui kod e-mel sebelum sampai ke app.
  1. Zero Trust → Access → Applications → Add → Self-hosted → `app.coachyoi.com`
  2. Policy: *Allow*, include *Emails* = e-mel anda
  3. Tambah aplikasi kedua dengan policy **Bypass** (Everyone) untuk laluan yang mesti terbuka kepada platform: `app.coachyoi.com/webhook/*`, `app.coachyoi.com/oauth/*`, `app.coachyoi.com/uploads/*`.
- Jangan kongsi fail `.env` atau token tunnel.

## Masalah lazim

| Masalah | Penyelesaian |
|---|---|
| Error 1033 / "Argo Tunnel error" | cloudflared tidak berjalan. Semak servis, atau `docker compose ps` |
| Error 502 Bad Gateway | App tidak berjalan pada port 3000, atau Service URL salah (`localhost:3000` vs `app:3000`) |
| Salepage www rosak selepas pindah DNS | Pastikan rekod `www` CNAME ke GitHub Pages wujud dan SSL/TLS = Full |
| Muat naik video gagal | Pelan percuma Cloudflare hadkan muat naik kepada 100 MB. Mampatkan video, atau guna URL media |
