// Wizard persediaan: sekali setup → app jalan sendiri (kandungan, komen, DM).
// Bergantung pada pembantu dalam index.html: $, esc, call, busy, toast, ICON, STATUS, go, loadStatus, loadAccounts.

const WZ_STEPS = ["Bisnes", "Otak AI", "Platform", "Sambung", "Autopilot", "Selesai"];
const WZ_KEYS = ["tiktok", "instagram", "threads", "whatsapp", "telegram"];
const WZ_NAMES = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", whatsapp: "WhatsApp", telegram: "Telegram" };
const WZ_METHODS = {
  tiktok: [["phone", "Telefon (ADB): post, komen & DM"], ["api", "API rasmi: post (+ balas komen beta)"]],
  instagram: [["api", "Log masuk Instagram: post, komen & DM"], ["phone", "Telefon (ADB)"]],
  threads: [["api", "Log masuk Threads: post & komen"], ["phone", "Telefon (ADB): termasuk DM"]],
  whatsapp: [["api", "Peranti dipautkan (imbas QR): DM"], ["phone", "Telefon (ADB)"]],
  telegram: [["api", "Bot Telegram: channel, komen & DM"], ["phone", "Telefon (ADB)"]],
};
const WZ_CREDS = {
  instagram: [["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"], "developers.facebook.com → app anda → Instagram → API setup with Instagram login", "instagram"],
  threads: [["THREADS_APP_ID", "THREADS_APP_SECRET"], "developers.facebook.com → app anda → use case Threads API", "threads"],
  tiktok: [["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"], "developers.tiktok.com → Manage apps → Login Kit + Content Posting API", "tiktok"],
};
const DAYS = ["Ahad", "Isnin", "Selasa", "Rabu", "Khamis", "Jumaat", "Sabtu"];

let WZ = null; // { step, s (settings), secrets, sel: {k: method} }

async function loadWizard() {
  const [s, sec] = await Promise.all([call("/api/settings"), call("/api/secrets")]);
  if (!STATUS) await loadStatus();
  const sel = {};
  for (const k of WZ_KEYS) if (s.connectVia[k]) sel[k] = s.connectVia[k];
  WZ = { step: WZ?.step ?? 0, s, sec, sel };
  renderWizard();
}

function wzHeader() {
  return `<div class="card"><div class="row" style="gap:6px">${WZ_STEPS.map((t, i) =>
    `<span class="pill ${i === WZ.step ? "ok" : ""}" style="cursor:pointer" data-wzgo="${i}">${i < WZ.step ? "✓" : i + 1 + "."} ${t}</span>`).join("")}</div></div>`;
}
function wzNav(nextLabel = "Seterusnya →") {
  return `<div class="row" style="justify-content:space-between;margin-top:4px">
    ${WZ.step > 0 ? '<button class="btn" id="wzBack">← Kembali</button>' : "<span></span>"}
    <button class="btn pri" id="wzNext">${nextLabel}</button></div>`;
}

function renderWizard() {
  const s = WZ.s;
  let body = "";
  switch (WZ.step) {
    case 0:
      body = `<div class="card"><h2>1. Tentang bisnes anda</h2>
        <p class="muted">AI hanya akan guna maklumat ini semasa membuat kandungan &amp; membalas pelanggan. Lebih lengkap, lebih tepat.</p>
        <label>Nama bisnes</label><input type="text" id="wzBrand" value="${esc(s.brandName)}" placeholder="cth: Coach Yoi">
        <label>Gaya bahasa</label><textarea id="wzVoice">${esc(s.brandVoice)}</textarea>
        <label>Produk, harga, cara order, link, waktu operasi, polisi, soalan lazim</label>
        <textarea id="wzInfo" style="min-height:180px" placeholder="Ebook Autopilot Bisnes RM39 (Basic), RM69 (Senior)...&#10;Order: link di bio / wa.me/60...&#10;Waktu: 9 pagi - 10 malam">${esc(s.businessInfo)}</textarea></div>
        <div class="card"><h2>⚡ Jawapan pantas (percuma, tanpa AI)</h2>
        <p class="muted">Soalan yang kerap ditanya, dijawab terus dengan templat.</p>
        <div id="wzQr">${(s.quickReplies.length ? s.quickReplies : [{ keywords: "harga, berapa, price", reply: "" }, { keywords: "cara order, macam mana nak beli", reply: "" }, { keywords: "cod, lokasi", reply: "" }])
          .map((q) => `<div class="row wzqr" style="margin-bottom:8px;align-items:flex-start"><input type="text" class="k" value="${esc(q.keywords)}" placeholder="kata kunci" style="flex:1;min-width:140px"><textarea class="r" placeholder="jawapan" style="flex:2;min-height:44px;min-width:200px">${esc(q.reply)}</textarea></div>`).join("")}</div>
        <button class="btn" id="wzQrAdd">+ Tambah</button></div>`;
      break;
    case 1: {
      const k = WZ.sec.keys.ANTHROPIC_API_KEY;
      body = `<div class="card"><h2>2. Otak AI</h2>
        <p>Pilih bagaimana AI berjalan:</p>
        <div class="card" style="margin:8px 0"><b>A. Claude API key</b> (disyorkan supaya app berjalan sendiri 24 jam)
          <p class="muted">Dapatkan di console.anthropic.com → API Keys. Bayar ikut guna (draf balasan guna Haiku, sangat murah). Key disimpan dalam server anda sahaja.</p>
          ${k.set ? `<p><span class="pill ok">Diset ${esc(k.hint)}</span> ${k.source === "env" ? '<span class="muted">(dari .env)</span>' : ""}</p>` : ""}
          <div class="row"><input type="password" id="wzKey" placeholder="${k.set ? "Biarkan kosong untuk kekal" : "sk-ant-..."}" style="flex:1" autocomplete="off"><button class="btn" id="wzKeyTest">Simpan &amp; uji</button></div></div>
        <div class="card" style="margin:8px 0"><b>B. Kit Claude (akaun Claude Pro/Max anda)</b>
          <p class="muted">Tanpa API key: Claude Code / Claude Desktop di komputer anda mengawal telefon &amp; inbox. Berjalan selagi komputer &amp; Claude dibuka. Lihat <code>kit/PASANG.md</code>. Anda boleh guna kedua-duanya.</p></div>
        <p class="muted">Tanpa A, app masih boleh: jawapan pantas, terima mesej, post yang anda tulis sendiri.</p></div>`;
      break;
    }
    case 2:
      body = `<div class="card"><h2>3. Pilih media sosial &amp; cara sambung</h2>
        <p class="muted"><b>API / log masuk</b>: rasmi &amp; stabil, berjalan di server. <b>Telefon (ADB)</b>: AI kawal app di telefon Android anda melalui komputer ini, untuk ciri yang tiada API (cth DM TikTok/Threads). Telefon mesti kekal disambung.</p>
        ${WZ_KEYS.map((k) => `<div class="item"><label style="display:flex;gap:8px;align-items:center;color:var(--text);font-size:15px"><input type="checkbox" data-wzsel="${k}" ${WZ.sel[k] ? "checked" : ""}> ${ICON[k]} <b>${WZ_NAMES[k]}</b></label>
          <select data-wzvia="${k}" style="margin-top:6px;${WZ.sel[k] ? "" : "display:none"}">${WZ_METHODS[k].map(([v, l]) => `<option value="${v}" ${(WZ.sel[k] || WZ_METHODS[k][0][0]) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`).join("")}</div>`;
      break;
    case 3: {
      const api = WZ_KEYS.filter((k) => WZ.sel[k] === "api");
      const ph = WZ_KEYS.filter((k) => WZ.sel[k] === "phone");
      const needCreds = api.filter((k) => WZ_CREDS[k] && !WZ_CREDS[k][0].every((n) => WZ.sec.keys[n].set));
      body = `<div class="card"><h2>4. Sambung akaun</h2><p class="muted">Tekan butang log masuk untuk setiap akaun. Selepas ini app ingat sambungan anda (token diperbaharui automatik).</p></div>`;
      if (needCreds.length) {
        body += `<div class="card"><h2>🔑 App pembangun (sekali sahaja)</h2>
          <p class="muted">Butang log masuk perlukan app pembangun anda sendiri. Daftar URL redirect di bawah dalam app tersebut, kemudian tampal ID &amp; Secret di sini. Panduan: README → "Persediaan sekali sahaja untuk butang OAuth".</p>
          ${needCreds.map((k) => { const [[id, sc], where, cb] = WZ_CREDS[k]; return `<div class="item"><b>${ICON[k]} ${WZ_NAMES[k]}</b><div class="muted">${where}</div>
            <div class="muted">URL redirect: <code>${esc(WZ.sec.redirectBase)}/${cb}/callback</code></div>
            <div class="row" style="margin-top:6px"><input type="text" data-secret="${id}" placeholder="${WZ.sec.keys[id].label}" style="flex:1"><input type="password" data-secret="${sc}" placeholder="${WZ.sec.keys[sc].label}" style="flex:1" autocomplete="off"></div></div>`; }).join("")}
          ${/^https:/.test(WZ.sec.publicUrl) ? "" : '<p class="pill err">PUBLIC_URL belum HTTPS: log masuk Meta/TikTok perlukan link HTTPS (lihat deploy/CLOUDFLARE.md)</p>'}
          <div class="row" style="margin-top:8px"><button class="btn pri" id="wzCredSave">Simpan</button></div></div>`;
      }
      if (api.length) body += `<div class="grid" id="wzAcct" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))"></div>`;
      if (ph.length) {
        body += `<div class="card"><h2>📱 Telefon untuk: ${ph.map((k) => WZ_NAMES[k]).join(", ")}</h2>
          <ol class="muted"><li>Telefon: Tetapan → Pilihan pembangun → <b>USB debugging</b> ON, sambung kabel ke komputer ini, tekan <b>Allow</b>.</li>
          <li>Pastikan app ${ph.map((k) => WZ_NAMES[k]).join(", ")} sudah log masuk di telefon.</li>
          <li>(Disyorkan) Pasang ADBKeyBoard supaya emoji boleh ditaip: lihat kit/PASANG.md.</li></ol>
          <div id="wzPhone" class="muted">Menyemak telefon…</div>
          <div class="row" style="margin-top:8px"><button class="btn" id="wzPhoneCheck">🔄 Semak semula</button><button class="btn" data-goto="phone">Sambung tanpa wayar…</button></div></div>`;
      }
      if (!api.length && !ph.length) body += `<div class="card"><p>Tiada platform dipilih. Kembali ke langkah 3.</p></div>`;
      break;
    }
    case 4: {
      const sel = WZ_KEYS.filter((k) => WZ.sel[k]);
      const ca = s.contentAuto;
      const postable = sel.filter((k) => k !== "whatsapp" || WZ.sel[k] === "phone");
      body = `<div class="card"><h2>5a. Balas komen &amp; DM</h2>
        <p class="muted"><b>Luluskan dahulu</b>: AI draf, anda tekan hantar (disyorkan minggu pertama). <b>Auto</b>: AI terus balas; soalan yang AI tak pasti tetap ditahan untuk anda.</p>
        <table>${sel.map((k) => `<tr><td>${ICON[k]} ${WZ_NAMES[k]}</td><td><select data-wzmode="${k}">${[["approve", "Luluskan dahulu"], ["auto", "Auto hantar"], ["off", "Mati"]].map(([v, l]) => `<option value="${v}" ${s.replyMode[k] === v ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("")}</table>
        ${sel.some((k) => WZ.sel[k] === "phone") ? `<label>Semak telefon untuk komen &amp; DM baharu setiap (minit)</label><input type="number" id="wzScan" min="15" value="${s.adb.scanMinutes || 60}" style="max-width:120px">` : ""}
      </div>
      <div class="card"><h2>5b. Autopilot kandungan</h2>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text);font-size:15px"><input type="checkbox" id="wzCa" ${ca.enabled ? "checked" : ""}> Hidupkan: AI cipta &amp; post kandungan ikut jadual</label>
        <label>Post ke</label><div class="chips">${postable.map((k) => `<label><input type="checkbox" data-wzca="${k}" ${ca.platforms.includes(k) || !ca.platforms.length ? "checked" : ""}> ${ICON[k]} ${WZ_NAMES[k]}</label>`).join("")}</div>
        <label>Hari</label><div class="chips">${DAYS.map((d, i) => `<label><input type="checkbox" data-wzday="${i}" ${ca.days.includes(i) ? "checked" : ""}> ${d}</label>`).join("")}</div>
        <label>Masa (waktu Malaysia)</label><input type="time" id="wzTime" value="${esc(ca.time)}" style="max-width:160px">
        <label>Tema kandungan (dipisah koma, digilir)</label><input type="text" id="wzPillars" value="${esc(ca.pillars)}" placeholder="tips bisnes, cerita pelanggan, behind the scenes, promosi ebook">
        <label>Sebelum post</label><select id="wzCaMode" style="max-width:320px"><option value="approve" ${ca.mode === "approve" ? "selected" : ""}>Tunggu kelulusan saya (disyorkan)</option><option value="auto" ${ca.mode === "auto" ? "selected" : ""}>Terus post</option></select>
        <p class="muted">Perlukan Claude API key (langkah 2). Instagram &amp; TikTok perlukan gambar/video: muat naik ke pustaka di bawah; setiap post guna satu media baharu.</p>
        <div id="wzMedia"></div></div>`;
      break;
    }
    case 5: {
      const sel = WZ_KEYS.filter((k) => WZ.sel[k]);
      const P = STATUS.platforms;
      const ok = (k) => (WZ.sel[k] === "phone" ? WZ.phoneOk : P[k]?.configured);
      body = `<div class="card"><h2>6. Semakan akhir</h2><table>
        <tr><td>🤖 Claude API key</td><td>${WZ.sec.keys.ANTHROPIC_API_KEY.set ? '<span class="pill ok">Ada</span>' : '<span class="pill warn">Tiada: autopilot kandungan &amp; draf AI tidak aktif</span>'}</td></tr>
        ${sel.map((k) => `<tr><td>${ICON[k]} ${WZ_NAMES[k]} <span class="muted">(${WZ.sel[k] === "phone" ? "telefon" : "API"})</span></td><td>${ok(k) ? '<span class="pill ok">Sedia</span>' : '<span class="pill warn">Belum disambung</span>'} <span class="muted">balasan: ${{ approve: "luluskan dahulu", auto: "auto", off: "mati" }[s.replyMode[k]]}</span></td></tr>`).join("")}
        <tr><td>📅 Autopilot kandungan</td><td>${s.contentAuto.enabled ? `<span class="pill ok">Aktif</span> <span class="muted">${s.contentAuto.days.map((d) => DAYS[d]).join(", ")} ${s.contentAuto.time}</span>` : '<span class="pill">Mati</span>'}</td></tr>
        <tr><td>⚡ Jawapan pantas</td><td>${s.quickReplies.length} templat</td></tr></table>
        <p class="muted" style="margin-top:12px">Anda boleh ubah semua ini bila-bila masa dalam Persediaan atau Tetapan.</p></div>`;
      break;
    }
  }
  $("#wiz").innerHTML = wzHeader() + body + wzNav(WZ.step === 5 ? "🚀 Hidupkan autopilot" : WZ.step === 1 ? "Seterusnya →" : "Simpan & seterusnya →");
  if (WZ.step === 3) {
    const api = WZ_KEYS.filter((k) => WZ.sel[k] === "api");
    if (api.length) loadAccounts("#wzAcct", api);
    if (WZ_KEYS.some((k) => WZ.sel[k] === "phone")) wzCheckPhone();
  }
  if (WZ.step === 4) renderMediaLib("#wzMedia");
  if (WZ.step === 5) wzCheckPhone(true);
}

async function wzCheckPhone(silent) {
  const ph = WZ_KEYS.filter((k) => WZ.sel[k] === "phone");
  if (!ph.length) return;
  let html = "";
  try {
    const d = await call("/api/adb/devices");
    const ready = d.devices.filter((x) => x.state === "device");
    if (!d.devices.length) html = '<span class="pill warn">Tiada telefon dikesan</span>';
    else if (!ready.length) html = `<span class="pill warn">${esc(d.devices[0].state)}</span>: buka kunci telefon dan tekan Allow USB debugging`;
    else {
      const apps = await call("/api/adb/apps");
      html = `<span class="pill ok">${esc(ready[0].model || ready[0].serial)} disambung</span><br>` + ph.map((k) => `${ICON[k]} ${WZ_NAMES[k]}: ${apps[k] ? "✅ dipasang" : "❌ tidak dijumpai"}`).join(" · ");
      WZ.phoneOk = ph.every((k) => apps[k]);
    }
  } catch (e) {
    html = `<span class="pill err">${esc(e.message)}</span>`;
  }
  if (!silent && $("#wzPhone")) $("#wzPhone").innerHTML = html;
  if (silent && WZ.step === 5 && WZ.phoneOk !== WZ._lastPhoneOk) { WZ._lastPhoneOk = WZ.phoneOk; renderWizard(); }
}

async function wzSave() {
  const s = WZ.s;
  switch (WZ.step) {
    case 0: {
      const quickReplies = [...document.querySelectorAll(".wzqr")].map((r) => ({ keywords: r.querySelector(".k").value, reply: r.querySelector(".r").value, kind: "all" })).filter((q) => q.keywords.trim() && q.reply.trim());
      WZ.s = { ...s, ...(await call("/api/settings", { method: "PUT", body: { brandName: $("#wzBrand").value, brandVoice: $("#wzVoice").value, businessInfo: $("#wzInfo").value, quickReplies } })) };
      if (!$("#wzInfo").value.trim()) toast("💡 Maklumat bisnes kosong: AI akan tanda kebanyakan soalan sebagai 'perlu anda'", 6000);
      break;
    }
    case 1:
      if ($("#wzKey").value.trim()) { WZ.sec = await call("/api/secrets", { method: "PUT", body: { ANTHROPIC_API_KEY: $("#wzKey").value.trim() } }).then((r) => ({ ...WZ.sec, keys: r.keys })); }
      break;
    case 2: {
      const connectVia = {};
      for (const k of WZ_KEYS) connectVia[k] = document.querySelector(`[data-wzsel="${k}"]`).checked ? document.querySelector(`[data-wzvia="${k}"]`).value : "";
      if (!Object.values(connectVia).some(Boolean)) throw new Error("Pilih sekurang-kurangnya satu platform");
      WZ.sel = Object.fromEntries(Object.entries(connectVia).filter(([, v]) => v));
      await call("/api/settings", { method: "PUT", body: { connectVia } });
      WZ.s.connectVia = connectVia;
      break;
    }
    case 3:
      await loadStatus();
      break;
    case 4: {
      const replyMode = {};
      document.querySelectorAll("[data-wzmode]").forEach((x) => (replyMode[x.dataset.wzmode] = x.value));
      const contentAuto = {
        enabled: $("#wzCa").checked,
        platforms: [...document.querySelectorAll("[data-wzca]:checked")].map((x) => x.dataset.wzca),
        days: [...document.querySelectorAll("[data-wzday]:checked")].map((x) => Number(x.dataset.wzday)),
        time: $("#wzTime").value || "20:00",
        pillars: $("#wzPillars").value,
        mode: $("#wzCaMode").value,
      };
      if (contentAuto.enabled && (!contentAuto.platforms.length || !contentAuto.days.length)) throw new Error("Pilih platform & hari untuk autopilot kandungan");
      const phoneApps = WZ_KEYS.filter((k) => WZ.sel[k] === "phone");
      const body = { replyMode, contentAuto, adb: { scanApps: phoneApps } };
      if ($("#wzScan")) body.adb.scanMinutes = Math.max(15, Number($("#wzScan").value) || 60);
      WZ.s = { ...WZ.s, ...(await call("/api/settings", { method: "PUT", body })) };
      break;
    }
    case 5:
      await call("/api/settings", { method: "PUT", body: { onboarded: true } });
      toast("🚀 Autopilot dihidupkan!", 5000);
      await loadStatus();
      go("dash");
      return false;
  }
  return true;
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#wiz")) return;
  const t = e.target;
  if (t.id === "wzNext") busy(t, async () => { if (await wzSave()) { WZ.step++; renderWizard(); window.scrollTo(0, 0); } });
  if (t.id === "wzBack") { WZ.step--; renderWizard(); }
  if (t.dataset.wzgo !== undefined) { WZ.step = Number(t.dataset.wzgo); renderWizard(); }
  if (t.id === "wzQrAdd") $("#wzQr").insertAdjacentHTML("beforeend", '<div class="row wzqr" style="margin-bottom:8px;align-items:flex-start"><input type="text" class="k" placeholder="kata kunci" style="flex:1;min-width:140px"><textarea class="r" placeholder="jawapan" style="flex:2;min-height:44px;min-width:200px"></textarea></div>');
  if (t.id === "wzKeyTest") busy(t, async () => {
    const v = $("#wzKey").value.trim();
    if (v) WZ.sec = { ...WZ.sec, keys: (await call("/api/secrets", { method: "PUT", body: { ANTHROPIC_API_KEY: v } })).keys };
    const r = await call("/api/secrets/test-ai", { method: "POST" });
    toast(`✅ API key berfungsi (${r.model})`);
    renderWizard();
  });
  if (t.id === "wzCredSave") busy(t, async () => {
    const vals = {};
    document.querySelectorAll("[data-secret]").forEach((x) => { if (x.value.trim()) vals[x.dataset.secret] = x.value.trim(); });
    WZ.sec = { ...WZ.sec, keys: (await call("/api/secrets", { method: "PUT", body: vals })).keys };
    toast("✅ Disimpan");
    renderWizard();
  });
  if (t.id === "wzPhoneCheck") wzCheckPhone();
});
document.addEventListener("change", (e) => {
  const k = e.target.dataset?.wzsel;
  if (k) document.querySelector(`[data-wzvia="${k}"]`).style.display = e.target.checked ? "" : "none";
});

// ---------- Pustaka media (wizard & Jadual Post) ----------
async function renderMediaLib(target) {
  const el = $(target);
  if (!el) return;
  const list = await call("/api/media");
  const unused = list.filter((m) => !m.usedAt).length;
  el.innerHTML = `<div class="row" style="margin:8px 0"><label class="btn" style="margin:0">📤 Muat naik gambar/video<input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" data-mlup style="display:none"></label><span class="muted">${unused} belum digunakan · ${list.length} jumlah</span></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px">${list.map((m) => `<div style="position:relative;border:1px solid var(--line);border-radius:8px;overflow:hidden;${m.usedAt ? "opacity:.5" : ""}">
      ${m.type === "video" ? `<video src="${esc(m.url)}" muted preload="metadata" style="width:100%;height:110px;object-fit:cover;display:block;background:#000"></video>` : `<img src="${esc(m.url)}" alt="${esc(m.name)}" style="width:100%;height:110px;object-fit:cover;display:block">`}
      <div class="muted" style="padding:4px 6px;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${m.usedAt ? "✓ digunakan" : esc(m.name)}</div>
      <button class="btn" data-mldel="${m.id}" title="Buang" style="position:absolute;top:4px;right:4px;padding:2px 8px">✕</button></div>`).join("")}</div>`;
  el.dataset.mlTarget = target;
}
document.addEventListener("change", async (e) => {
  if (!e.target.hasAttribute?.("data-mlup")) return;
  const box = e.target.closest("[data-ml-target]");
  const files = [...e.target.files];
  for (const [i, f] of files.entries()) {
    toast(`Memuat naik ${i + 1}/${files.length}…`, 60000);
    try {
      await call(`/api/upload?library=1&name=${encodeURIComponent(f.name)}`, { method: "POST", body: f, headers: { "Content-Type": f.type } });
    } catch (err) {
      toast(`❌ ${f.name}: ${err.message}`, 6000);
    }
  }
  toast("✅ Selesai");
  renderMediaLib(box.dataset.mlTarget);
});
document.addEventListener("click", (e) => {
  const id = e.target.dataset?.mldel;
  if (!id || !confirm("Buang media ini dari pustaka?")) return;
  const box = e.target.closest("[data-ml-target]");
  busy(e.target, async () => { await call(`/api/media/${id}`, { method: "DELETE" }); renderMediaLib(box.dataset.mlTarget); });
});

// ---------- Autopilot kandungan: jana sekarang ----------
$("#caRun").onclick = (e) => busy(e.target, async () => {
  toast("AI sedang mencipta post…", 60000);
  const p = await call("/api/content-auto/run", { method: "POST" });
  toast(p.status === "pending_approval" ? "✅ Post sedia: semak & luluskan di bawah" : "✅ Post diterbitkan", 6000);
  loadPosts();
});

// ---------- Log keluar ----------
$("#btnLogout").onclick = async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/login"; };

// Buka wizard secara automatik jika belum disediakan
loadStatus().then(() => { if (STATUS && !STATUS.onboarded) go("setup"); }).catch(() => {});
