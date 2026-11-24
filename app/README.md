# Autopilot Sosial

Dashboard web untuk urus **TikTok, Instagram, Threads, Telegram dan WhatsApp** di satu tempat:

- ✨ **Cipta kandungan dengan AI (Claude):** satu brief → kapsyen khas untuk setiap platform + cadangan visual/skrip video. Ada butang "Beri saya 7 idea".
- 🚀 **Auto-post / jadual post:** terbit sekarang atau jadualkan, ke banyak platform sekali gus.
- 🔐 **Sambung akaun tanpa salin token:** butang log masuk (OAuth) untuk Instagram/Threads/TikTok, dan imbas QR untuk WhatsApp.
- 💬 **Auto-balas komen & DM:** AI draf balasan berdasarkan maklumat bisnes anda. Pilih mod setiap platform:
  - **Mati**: tiada balasan AI
  - **Luluskan dahulu** (lalai): AI draf, anda semak dan tekan *Hantar*
  - **Auto hantar**: AI terus balas. Soalan yang AI tak pasti (harga tiada dalam info, aduan, refund) tetap ditahan untuk anda.
- 🧪 **Simulasi**: uji gaya balasan AI tanpa hantar apa-apa ke platform sebenar.

## Cara jalankan

Perlu Node.js 22 ke atas.

```bash
cd app
npm install
cp .env.example .env     # isi ANTHROPIC_API_KEY, PUBLIC_URL, ADMIN_PASSWORD & App ID/Secret
npm start                # http://localhost:3000  (login: admin / ADMIN_PASSWORD)
```

Untuk OAuth, webhook dan supaya Instagram/Threads/TikTok boleh ambil media, app mesti dihoskan pada **URL HTTPS awam**, contohnya VPS dengan Caddy/Nginx, Railway, Render atau Fly.io. Set `PUBLIC_URL` kepada URL tersebut. Folder `data/` (pangkalan data, token & sesi WhatsApp) dan `public/uploads/` mesti kekal antara restart, jadi guna disk/volume kekal. App ini perlu berjalan 24 jam supaya WhatsApp kekal disambung.

> ⚠️ Repo ini juga dihoskan oleh GitHub Pages (salepage). GitHub Pages **tidak boleh** menjalankan app ini, kerana ia hanya menghidang fail statik. Hoskan folder `app/` di server Node.js berasingan. Jangan sekali-kali commit fail `.env` atau folder `data/`.

## Cara sambung akaun (tab **Akaun** dalam dashboard)

| Platform  | Cara sambung | Post | Balas komen | Balas DM |
|-----------|--------------|:----:|:-----------:|:--------:|
| Instagram | Butang **Log masuk dengan Instagram** (OAuth) | ✅ gambar / Reels | ✅ | ✅ |
| Threads   | Butang **Log masuk dengan Threads** (OAuth) | ✅ | ✅ | ❌ tiada API DM |
| TikTok    | Butang **Log masuk dengan TikTok** (OAuth) | ✅ video / foto | ✅ beta (TikTok API for Business) | ❌ (lihat nota) |
| WhatsApp  | **Peranti dipautkan**: imbas QR atau kod pautan | ❌ | – | ✅ |
| Telegram  | Tampal token bot dari @BotFather | ✅ ke channel | ✅ | ✅ |

Token disimpan dalam `data/db.json` dan diperbaharui secara automatik sebelum luput: Instagram/Threads setiap ~60 hari, TikTok setiap 24 jam. Jika pembaharuan gagal, log aktiviti akan minta anda log masuk semula.

### WhatsApp: Peranti dipautkan
1. Tab **Akaun** → **Pautkan dengan kod QR**.
2. Di telefon: WhatsApp → Tetapan → **Peranti dipautkan** → **Pautkan peranti** → imbas QR.
   Boleh juga masukkan nombor (cth `60123456789`) → **Dapatkan kod** → di telefon pilih *Pautkan dengan nombor telefon* dan masukkan kod 8 aksara itu.
3. Sesi disimpan dalam `data/whatsapp-auth/`, jadi tak perlu imbas semula selepas restart.

> ⚠️ Cara ini menggunakan protokol WhatsApp Web (pustaka [Baileys](https://github.com/WhiskeySockets/Baileys)) dan **bukan API rasmi Meta**. Ia melanggar Terma WhatsApp, jadi nombor anda berisiko disekat, terutamanya jika menghantar mesej pukal atau spam. App ini hanya membalas mesej yang masuk (bukan kumpulan), menunjukkan "sedang menaip" dan menunggu beberapa saat sebelum membalas. Disyorkan guna nombor WhatsApp Business khas untuk bisnes.

### Persediaan sekali sahaja untuk butang OAuth
Supaya butang "Log masuk dengan…" berfungsi, daftar **app pembangun** sekali dan isi ID/Secret dalam `.env`. Daftarkan URL redirect berikut (ganti dengan `PUBLIC_URL` anda, mesti HTTPS):

```
https://DOMAIN/oauth/instagram/callback
https://DOMAIN/oauth/threads/callback
https://DOMAIN/oauth/tiktok/callback
```

**Instagram**: developers.facebook.com → Create App → tambah produk **Instagram** → *API setup with Instagram login*.
- Salin *Instagram app ID/secret* → `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`.
- Di *Business login settings*, tambah redirect URL di atas.
- (Pilihan) Webhooks: URL `https://DOMAIN/webhook/meta`, verify token `META_VERIFY_TOKEN`, subscribe `comments` dan `messages`. Tanpa webhook, komen akan disemak secara berkala.
- Akaun Instagram mesti jenis Business/Creator.

**Threads**: dalam Meta App, tambah use case **Access the Threads API**.
- Pilih kebenaran `threads_basic`, `threads_content_publish`, `threads_read_replies`, `threads_manage_replies`.
- Tambah *Redirect Callback URL*.
- Salin *Threads app ID/secret* → `THREADS_APP_ID`, `THREADS_APP_SECRET`.

**TikTok**: developers.tiktok.com → Manage apps → Create app.
- Tambah **Login Kit** (redirect URI di atas) dan **Content Posting API** (aktifkan *Direct Post*).
- Scope: `user.info.basic`, `video.publish`.
- Sahkan domain `PUBLIC_URL` (*URL properties*), kerana TikTok akan tarik video dari domain itu.
- Salin *Client key/secret* → `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.
- Sebelum app diaudit TikTok, post hanya boleh peribadi (`TIKTOK_PRIVACY_LEVEL=SELF_ONLY`).

Semasa app Meta dan TikTok masih dalam mod *Development*, hanya akaun yang didaftarkan sebagai tester boleh log masuk. Untuk akaun anda sendiri, cara ini sudah memadai.

**TikTok: balas komen (beta)**: app berasingan di **business-api.tiktok.com** (TikTok API for Business).
- Mohon kebenaran **TikTok Accounts** (Business User, Business Media, Business Comment) dan isi borang akses Accounts API. TikTok akan menyemak permohonan anda.
- Redirect URI: `https://DOMAIN/oauth/tiktokBiz/callback`.
- Salin App ID/Secret → `TIKTOK_BIZ_APP_ID`, `TIKTOK_BIZ_APP_SECRET`.
- Akaun TikTok mesti **Business Account**. Komen disemak setiap N minit (10 video terkini, 30 komen terbaru setiap video). Balasan dihadkan kepada 150 aksara.
- Endpoint ini dibina mengikut dokumentasi awam TikTok tetapi belum diuji dengan akaun sebenar. Jika ada ralat, mesejnya akan dipaparkan dalam log aktiviti.

**Nota DM TikTok & Threads:**
- TikTok ada *Business Messaging API* (beta tertutup). Ia memerlukan Verified Business Account, semakan TikTok, dan hanya dibuka untuk rantau tertentu. Belum disokong dalam app ini.
- Threads langsung tiada API untuk DM.
- Untuk kedua-duanya, AI akan balas komen dan mengajak pelanggan DM di WhatsApp/Instagram (jika maklumat itu ada dalam Tetapan).

**Claude AI**: dapatkan API key di console.anthropic.com → `ANTHROPIC_API_KEY`.

## Mod Telefon (ADB): Claude kawal telefon Android anda

Untuk perkara yang API rasmi tak benarkan (DM TikTok, DM Threads, atau jika anda tak mahu daftar app pembangun), app ini boleh guna **telefon Android anda sendiri melalui ADB**. Claude akan lihat skrin (screenshot + senarai elemen UI), kemudian tekan, leret dan taip dalam app TikTok, Instagram, Threads, WhatsApp atau Telegram, sama seperti manusia.

**Apa yang ia buat**
- **Imbas**: buka app, cari komen & DM baharu, dan masukkan ke Inbox. Mod ini tidak boleh menaip langsung.
- **Balas**: untuk mesej dari telefon, butang *Hantar* (atau mod Auto) akan suruh ejen cari mesej itu dan taip **teks balasan yang tepat** sahaja. Ejen tidak boleh ubah teks.
- **Arahan bebas**: cth "upload video terbaru dari galeri ke TikTok dengan kapsyen …".
- Setiap langkah ejen direkodkan dalam tab *Telefon (ADB)*, dan skrin telefon boleh dilihat secara langsung.
- Hanya satu tugas berjalan pada satu masa. Selepas selesai, telefon kembali ke skrin utama.

**Persediaan**
1. Pasang [Android platform-tools](https://developer.android.com/tools/releases/platform-tools) (`adb`) pada komputer yang menjalankan app ini (atau set `ADB_PATH`).
2. Telefon: aktifkan *Pilihan pembangun* → **USB debugging**. Sambung USB dan tekan *Allow*.
   Tanpa wayar (Android 11+): aktifkan **Wireless debugging**, kemudian Pair & Sambung dari tab *Telefon (ADB)*.
3. (Disyorkan) Pasang **ADBKeyBoard** dan jadikannya papan kekunci aktif supaya emoji & aksara khas boleh ditaip. Kemudian tandakan pilihan itu dalam tab Telefon. Tanpa ADBKeyBoard, hanya huruf ASCII dihantar.
4. Log masuk akaun dalam app di telefon seperti biasa. Biarkan telefon dicas dan skrin tidak berkunci (atau tanpa PIN).
5. Pilih app untuk diimbas, dan set selang masa (lalai 30 minit).

**Nota penting**
- App ini mesti berjalan pada **komputer yang disambung ke telefon** (atau rangkaian yang sama untuk wireless), bukan di cloud. Jika perlukan URL HTTPS untuk OAuth/webhook, guna tunnel seperti Cloudflare Tunnel.
- Setiap imbasan/balasan ialah beberapa panggilan Claude dengan screenshot. Ini lebih mahal berbanding API biasa, jadi jangan set selang terlalu kerap.
- Automasi UI melanggar terma kebanyakan platform, jadi ada risiko akaun disekat. Ejen sengaja bergerak perlahan seperti manusia, tetapi elakkan balasan pukal.
- UI app sentiasa berubah. Jika ejen gagal, lihat log langkah dalam tab Telefon.

## Tips supaya balasan AI tepat
Isi **Tetapan → Maklumat bisnes** selengkap mungkin: senarai produk & harga, cara bayar, link order, waktu operasi, polisi pulangan dan FAQ. AI diarah untuk **tidak mereka** maklumat yang tiada di situ; soalan sebegitu akan ditanda *Perlu anda*.

## Struktur
```
app/
  server.js              # Express: dashboard, API, webhook
  lib/ai.js              # Claude: jana kandungan, idea, draf balasan
  lib/engine.js          # inbox, auto-balas, penjadual post, polling
  lib/accounts.js        # OAuth log masuk & pembaharuan token
  lib/adb.js             # kawalan telefon Android (adb)
  lib/phoneAgent.js      # ejen Claude yang kawal telefon (imbas/balas/arahan)
  lib/db.js              # stor JSON (data/db.json)
  lib/platforms/*.js     # integrasi TikTok, Instagram, Threads, Telegram, WhatsApp
  public/index.html      # dashboard
```
