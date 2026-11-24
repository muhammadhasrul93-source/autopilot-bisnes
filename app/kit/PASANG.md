# Autopilot Sosial × Claude: panduan pemasangan

Dengan kit ini, **Claude anda sendiri** (Claude Code atau Claude Desktop, log masuk dengan akaun Claude anda) boleh:

- kawal telefon Android anda melalui ADB: buka TikTok, Instagram, Threads, WhatsApp, Telegram;
- semak komen & DM baharu, dan balas ikut gaya bahasa & maklumat bisnes anda;
- cipta kapsyen dan post (melalui telefon, atau API jika disambung);
- ulang semakan secara automatik, cth setiap 30 minit.

Penggunaan Claude dikira dalam **had langganan Claude anda sendiri** (Pro / Max). Tiada API key diperlukan.

---

## 1. Keperluan

| Perkara | Nota |
|---|---|
| Komputer Windows 10/11 atau macOS | Mesti hidup semasa automasi berjalan |
| Telefon Android 8+ | Akaun media sosial sudah log masuk dalam app |
| Kabel USB (atau Wi-Fi yang sama) | Untuk ADB |
| Akaun Claude berbayar (Pro / Max) | Untuk Claude Code / Claude Desktop |

## 2. Pasang perisian (sekali sahaja)

1. **Node.js 22 atau lebih baharu**: muat turun versi LTS dari <https://nodejs.org> dan pasang.
2. **Android platform-tools (adb)**: muat turun dari <https://developer.android.com/tools/releases/platform-tools>, kemudian ekstrak.
   - Windows: ekstrak ke `C:\platform-tools`, kemudian tambah folder itu ke **PATH** (Tetapan → Sistem → About → Advanced system settings → Environment Variables → Path → New).
   - macOS: `brew install android-platform-tools`, atau ekstrak dan tambah ke PATH.
   - Semak dengan membuka terminal baharu dan taip `adb version`.
3. **Claude Code**: ikut arahan rasmi di <https://code.claude.com/docs/en/setup>.
   - macOS: `curl -fsSL https://claude.ai/install.sh | bash`
   - Windows (PowerShell): `irm https://claude.ai/install.ps1 | iex`

   (Pilihan) **Claude Desktop**: <https://claude.ai/download>

## 3. Pasang Autopilot Sosial

```bash
git clone <URL repo ini> autopilot-bisnes      # atau muat turun ZIP dan ekstrak
cd autopilot-bisnes/app
npm install
npm run pasang                 # cipta ruang kerja ~/AutopilotSosial + daftar dengan Claude Code
npm run pasang -- --desktop    # (pilihan) juga tambah ke Claude Desktop
```

Pemasang akan:
- semak Node.js dan adb;
- cipta folder **AutopilotSosial** dalam folder rumah anda, yang mengandungi `CLAUDE.md` (arahan kerja untuk Claude);
- daftarkan pelayan MCP `autopilot` dengan Claude Code untuk folder itu;
- benarkan alat `autopilot` berjalan tanpa ditanya setiap kali (perlu untuk semakan automatik). Jika anda mahu meluluskan setiap tindakan sendiri, buang `"mcp__autopilot"` dari `AutopilotSosial/.claude/settings.json`;
- dengan `--desktop`: tambah `autopilot` ke `claude_desktop_config.json`. Fail asal disimpan sebagai `.backup`.

## 4. Sediakan telefon

1. **Aktifkan Pilihan pembangun**: Tetapan → Perihal telefon → ketik **Nombor binaan** 7 kali.
2. Tetapan → Pilihan pembangun → **USB debugging** → ON.
3. Sambung kabel USB, kemudian jalankan `adb devices`. Pada telefon, tekan **Allow** (tandakan "Always allow").
   Status mesti `device`. Jika `unauthorized`, buka kunci telefon dan tekan Allow.
4. **ADBKeyBoard** (sangat disyorkan, supaya emoji & huruf khas boleh ditaip):
   - Muat turun `ADBKeyboard.apk` dari <https://github.com/senzhk/ADBKeyBoard/releases>.
   - Pasang dan aktifkan:
     ```bash
     adb install ADBKeyboard.apk
     adb shell ime enable com.android.adbkeyboard/.AdbIME
     adb shell ime set com.android.adbkeyboard/.AdbIME
     ```
   - Untuk kembali ke papan kekunci biasa: Tetapan → Papan kekunci, atau `adb shell ime reset`.
5. Set skrin supaya tidak berkunci terlalu cepat dan tanpa PIN semasa automasi (atau buka kunci sebelum mula). Pastikan telefon dicas.

**Tanpa wayar (Android 11+):** Pilihan pembangun → **Wireless debugging** → ON. Selepas itu, beritahu Claude:
> "Sambung telefon wireless: pair 192.168.1.20:37099 kod 123456, kemudian sambung 192.168.1.20:41235"

## 5. Mula guna (Claude Code)

```bash
cd ~/AutopilotSosial        # Windows: cd %USERPROFILE%\AutopilotSosial
claude
```

- Kali pertama: log masuk dengan akaun Claude anda, dan pilih **Yes, I trust this folder**.
- Taip `/mcp` dan pastikan `autopilot` berstatus **connected**.
- Isi maklumat bisnes (sekali sahaja):
  ```
  /mcp__autopilot__tetapkan_bisnes
  ```
  Claude akan tanya nama bisnes, produk & harga, cara order, FAQ, gaya bahasa, dan mod balasan setiap platform:
  - **approve** (disyorkan pada mulanya): Claude tunjuk draf, anda luluskan;
  - **auto**: Claude terus balas;
  - **off**: tidak membalas.

### Kegunaan harian

| Mahu buat | Taip dalam Claude |
|---|---|
| Semak & balas semua komen/DM | `/mcp__autopilot__semak_dan_balas` |
| Hanya TikTok & WhatsApp | `/mcp__autopilot__semak_dan_balas tiktok,whatsapp` |
| Ulang setiap 30 minit | `/loop 30m /mcp__autopilot__semak_dan_balas` |
| Cipta & post kandungan | `/mcp__autopilot__cipta_dan_post` (beri topik & laluan video) |
| Apa-apa sahaja | Cakap biasa, cth *"Balas DM WhatsApp dari Aminah, beritahu stok ada"* |

Nota tentang `/loop`:
- Ia berjalan selagi tetingkap Claude Code dibuka dan tidak sibuk, dan tamat selepas 7 hari.
- Biarkan terminal terbuka dan komputer tidak tidur.
- Untuk berhenti, tekan `Esc` atau tutup sesi.

### Cara paling jimat

1. **Jawapan pantas:** isi templat untuk soalan lazim (harga, cara order, lokasi). Mesej yang sepadan terus guna templat. Beritahu Claude:
   > "Tambah jawapan pantas: kata kunci 'harga, berapa' → 'Harga ebook RM39 sahaja 😊 Order di link bio ya!'"

   Atau isi di dashboard → Tetapan → Jawapan pantas.
2. **Guna model Sonnet** untuk kerja rutin: taip `/model sonnet` sebelum `/loop`. Had langganan bertahan lebih lama berbanding Opus.
3. **Kurangkan kekerapan:** `/loop 60m` (atau 2 hingga 3 kali sehari), dan hadkan app yang disemak, cth `semak_dan_balas tiktok,whatsapp`.
4. **Sambungkan API** untuk Instagram, Threads dan Telegram di dashboard. Claude akan menarik komen sebagai teks, tanpa perlu buka app di telefon.
5. **Skrin teks:** Claude membaca skrin sebagai senarai teks secara lalai, dan screenshot hanya dihantar bila perlu. Jangan minta Claude "tengok gambar skrin" kecuali perlu.

## 6. Guna dengan Claude Desktop (pilihan)

Selepas `npm run pasang -- --desktop`, **tutup sepenuhnya** Claude Desktop (Quit) dan buka semula.

- Alat `autopilot` akan muncul dalam menu alat/connector. Prompt *semak_dan_balas* dan lain-lain boleh dipilih dari menu **+**.
- Untuk automasi berkala, guna **tugasan berjadual setempat** (Scheduled tasks) di Claude Desktop. Ia hanya berjalan semasa komputer hidup dan Claude Desktop dibuka, kerana telefon disambung ke komputer anda.

## 7. Dashboard web (pilihan)

`npm start` dalam folder `app`, kemudian buka <http://localhost:3000>.
- Inbox, log dan maklumat bisnes dikongsi dengan Claude: apa yang Claude rekod akan kelihatan di dashboard.
- Sambungan API (Instagram, Threads, TikTok, Telegram) dibuat di tab **Akaun**. Claude boleh menggunakannya melalui alat `sosial_*`.
- Ciri AI *dalam* dashboard (butang "Jana dengan AI") memerlukan `ANTHROPIC_API_KEY` (bayar ikut guna). Kit Claude ini **tidak** memerlukannya.

## 8. Masalah lazim

| Masalah | Penyelesaian |
|---|---|
| `adb: command not found` | platform-tools belum ditambah ke PATH. Buka terminal baharu selepas menambahnya |
| Status `unauthorized` | Buka kunci telefon dan tekan **Allow USB debugging** |
| `autopilot` tidak connected dalam `/mcp` | Jalankan `npm install` dalam folder app, kemudian `npm run pasang` semula |
| Emoji hilang semasa menaip | Pasang & aktifkan ADBKeyBoard (langkah 4) |
| Claude tersilap tekan | UI app berubah-ubah. Beritahu Claude apa yang betul; ia akan belajar dalam sesi itu |
| Had penggunaan cepat habis | Kurangkan kekerapan `/loop` (cth 60m), atau hadkan app yang disemak |

## 9. Penting: had & risiko

- Mengawal telefon menggunakan banyak screenshot, jadi ia menggunakan had langganan lebih cepat daripada sembang biasa. Pelan Max lebih sesuai untuk semakan kerap.
- Automasi skrin melanggar terma kebanyakan platform media sosial, jadi ada risiko akaun disekat. Balas mesej sebenar sahaja: jangan spam, jangan mesej pukal, dan jangan follow/like secara automatik.
- Anda bertanggungjawab ke atas apa yang dihantar. Mulakan dengan mod **approve** dan semak beberapa hari sebelum beralih ke **auto**.
- Setiap pelanggan perlu guna akaun Claude **sendiri** di komputer sendiri. Jangan kongsi log masuk Claude.
