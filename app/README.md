# Autopilot Sosial

Dashboard web untuk urus **TikTok, Instagram, Threads, Telegram dan WhatsApp** di satu tempat:

- ✨ **Cipta kandungan dengan AI (Claude):** satu brief → kapsyen khas untuk setiap platform + cadangan visual/skrip video. Ada butang "Beri saya 7 idea".
- 🚀 **Auto-post / jadual post:** terbit sekarang atau jadualkan, ke banyak platform sekali gus.
- 💬 **Auto-balas komen & DM:** AI draf balasan berdasarkan maklumat bisnes anda. Pilih mod setiap platform:
  - **Mati**: tiada balasan AI
  - **Luluskan dahulu** (lalai): AI draf, anda semak dan tekan *Hantar*
  - **Auto hantar**: AI terus balas. Soalan yang AI tak pasti (harga tiada dalam info, aduan, refund) tetap ditahan untuk anda.
- 🧪 **Simulasi**: uji gaya balasan AI tanpa hantar apa-apa ke platform sebenar.

## Apa yang setiap platform benarkan (API rasmi)

| Platform  | Post | Balas komen | Balas DM | Cara terima mesej |
|-----------|:----:|:-----------:|:--------:|-------------------|
| Telegram  | ✅ ke channel | ✅ (kumpulan perbincangan channel) | ✅ | Webhook |
| Instagram | ✅ gambar / Reels | ✅ | ✅ | Webhook + semakan berkala |
| Threads   | ✅ teks / gambar / video | ✅ | ❌ tiada API DM | Semakan berkala |
| WhatsApp  | ❌ API tidak sokong Status/Channel | — | ✅ | Webhook |
| TikTok    | ✅ video / foto | ❌ | ❌ | — |

Had ini datang daripada platform itu sendiri, bukan daripada app ini. App ini guna API rasmi sahaja (tiada bot scraping), jadi akaun anda tidak berisiko kena ban.

## Cara jalankan

Perlu Node.js 22 ke atas.

```bash
cd app
npm install
cp .env.example .env     # isi kunci API
npm start                # http://localhost:3000  (login: admin / ADMIN_PASSWORD)
```

Untuk webhook dan supaya Instagram/Threads/TikTok boleh ambil media, app mesti dihoskan pada **URL HTTPS awam**, contohnya VPS dengan Caddy/Nginx, Railway, Render atau Fly.io. Set `PUBLIC_URL` kepada URL tersebut. Folder `data/` (pangkalan data JSON) dan `public/uploads/` mesti kekal antara restart: guna disk/volume kekal.

> ⚠️ Repo ini juga dihoskan oleh GitHub Pages (salepage). GitHub Pages **tidak boleh** menjalankan app ini, kerana ia hanya menghidang fail statik. Hoskan folder `app/` di server Node.js berasingan. Jangan sekali-kali commit fail `.env`.

## Sambung setiap platform

### Claude AI
Dapatkan API key di console.anthropic.com → `ANTHROPIC_API_KEY`. Model lalai `claude-opus-5-5` (boleh tukar dengan `CLAUDE_MODEL`). Fallback automatik pihak server diaktifkan: jika model utama menolak sesuatu permintaan, API cuba model lain.

### Telegram
1. Chat dengan **@BotFather** → `/newbot` → salin token ke `TELEGRAM_BOT_TOKEN`.
2. Jadikan bot **admin** channel anda → `TELEGRAM_CHANNEL_ID=@namachannel`.
3. (Untuk komen) sambungkan *Discussion group* pada channel dan tambah bot ke kumpulan itu. Di BotFather, `/setprivacy` → *Disable* supaya bot nampak mesej kumpulan.
4. Dalam dashboard → **Tetapan** → *Sambung webhook Telegram*.

### WhatsApp (Cloud API)
1. developers.facebook.com → Create App (Business) → tambah produk **WhatsApp**.
2. Salin *Phone number ID* → `WHATSAPP_PHONE_NUMBER_ID`, dan token kekal (System User) → `WHATSAPP_TOKEN`.
3. Webhooks → Callback URL `https://DOMAIN/webhook/meta`, Verify token = `META_VERIFY_TOKEN` → subscribe field **messages**.
4. Isi `META_APP_SECRET` (App Settings → Basic) supaya tandatangan webhook disahkan.

Nota: balasan bebas hanya dibenarkan dalam **24 jam** selepas pelanggan mesej. Di luar tempoh itu, Meta wajibkan template yang diluluskan.

### Instagram
1. Akaun Instagram mesti jenis **Business/Creator**.
2. Dalam Meta App yang sama, tambah produk **Instagram** → *API setup with Instagram login* → jana token → `INSTAGRAM_ACCESS_TOKEN`, dan ID akaun → `INSTAGRAM_USER_ID`.
3. Kebenaran: `instagram_business_basic`, `instagram_business_content_publish`, `instagram_business_manage_comments`, `instagram_business_manage_messages`.
4. Webhooks (objek Instagram) → URL `https://DOMAIN/webhook/meta` → subscribe **comments** dan **messages**.

### Threads
1. Meta App → tambah use case **Access the Threads API**.
2. Kebenaran: `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`.
3. Jana token → `THREADS_ACCESS_TOKEN` dan `THREADS_USER_ID`. Balasan disemak setiap N minit (Tetapan).

### TikTok
1. developers.tiktok.com → cipta app → tambah **Content Posting API** (scope `video.publish`).
2. Sahkan domain `PUBLIC_URL` anda (URL properties), kerana TikTok tarik video dari URL itu.
3. Dapatkan access token pengguna melalui OAuth (Login Kit) → `TIKTOK_ACCESS_TOKEN`.
4. Sebelum app anda diaudit TikTok, post hanya boleh `SELF_ONLY` (peribadi). Selepas lulus audit, set `TIKTOK_PRIVACY_LEVEL=PUBLIC_TO_EVERYONE`.

Token Meta, Threads dan TikTok ada tempoh luput. Perbaharui token tersebut secara berkala (token jangka panjang Meta/Threads: 60 hari).

## Tips supaya balasan AI tepat
Isi **Tetapan → Maklumat bisnes** selengkap mungkin: senarai produk & harga, cara bayar, link order, waktu operasi, polisi pulangan dan FAQ. AI diarah untuk **tidak mereka** maklumat yang tiada di situ; soalan sebegitu akan ditanda *Perlu anda*.

## Struktur
```
app/
  server.js              # Express: dashboard, API, webhook
  lib/ai.js              # Claude: jana kandungan, idea, draf balasan
  lib/engine.js          # inbox, auto-balas, penjadual post, polling
  lib/db.js              # stor JSON (data/db.json)
  lib/platforms/*.js     # integrasi TikTok, Instagram, Threads, Telegram, WhatsApp
  public/index.html      # dashboard
```
