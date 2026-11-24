/* Coach Yoi — notifikasi "baru beli" daripada jualan Stripe SEBENAR.
 * Sumber: Apps Script feed (nama disamarkan, cth "andy***" + masa beli).
 * Tiada data rekaan: jika tiada jualan dalam 14 hari, tiada notifikasi dipaparkan.
 */
(function () {
  var FEED = 'https://script.google.com/macros/s/AKfycbzXQgnuUohbecjquN1xQT41p2iw4fsJoGzejrpEJv2HP__veDF188mTLFRT3jHlPcegaA/exec';
  var MAX_AGE = 14 * 864e5;      // hanya pembelian 14 hari terakhir
  var COUNT_MIN = 10;            // papar "X orang dah beli" hanya bila >= 10
  var FIRST_DELAY = 7000, SHOW_MS = 5500, GAP_MS = 14000, MAX_TOASTS = 5;

  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { return null; } }

  function ago(t) {
    var m = Math.floor((Date.now() - t) / 60000);
    if (m < 2) return 'baru sahaja';
    if (m < 60) return m + ' minit lalu';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' jam lalu';
    var d = Math.floor(h / 24);
    return d === 1 ? 'semalam' : d + ' hari lalu';
  }

  function css() {
    var s = document.createElement('style');
    s.textContent =
      '.cy-sp{position:fixed;left:14px;bottom:92px;z-index:60;max-width:330px;display:flex;gap:12px;align-items:center;' +
      'background:#fff;color:#1d1b19;border-radius:14px;padding:12px 34px 12px 12px;box-shadow:0 14px 40px rgba(0,0,0,.45);' +
      'font:500 13.5px/1.35 "Plus Jakarta Sans",system-ui,sans-serif;transform:translateY(20px);opacity:0;pointer-events:none;transition:all .35s}' +
      '.cy-sp.on{transform:none;opacity:1;pointer-events:auto}' +
      '.cy-sp .ic{flex:none;width:40px;height:40px;border-radius:10px;background:#D97757;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px}' +
      '.cy-sp b{color:#000}.cy-sp small{display:block;color:#6f6a63;font-size:12px;margin-top:2px}.cy-sp small i{font-style:normal;color:#1E8E5A;font-weight:700}' +
      '.cy-sp .x{position:absolute;top:6px;right:8px;border:0;background:none;color:#8a847b;font-size:16px;cursor:pointer;padding:4px;line-height:1}' +
      '.cy-count{display:inline-block;margin:10px 0 0;font-weight:700;font-size:14px;color:#C15F3C}' +
      '@media(max-width:480px){.cy-sp{left:10px;right:10px;max-width:none;bottom:86px}}';
    document.head.appendChild(s);
  }

  function run(data) {
    var now = Date.now();
    var list = (data && data.recent || []).filter(function (r) { return r && r.n && r.t && now - r.t < MAX_AGE && r.t <= now + 6e4; });

    if (data && data.count >= COUNT_MIN) {
      var box = document.querySelector('#harga .box .badge');
      if (box && !document.querySelector('.cy-count')) {
        var c = document.createElement('div');
        c.className = 'cy-count';
        c.textContent = '🔥 ' + data.count + ' orang dah beli pakej ini';
        box.insertAdjacentElement('afterend', c);
      }
    }
    if (!list.length || ss('cy_sp_off')) return;

    css();
    var el = document.createElement('div');
    el.className = 'cy-sp';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<div class="ic">🛒</div><div class="tx"></div><button class="x" aria-label="Tutup">×</button>';
    document.body.appendChild(el);
    var tx = el.querySelector('.tx'), i = 0, shown = 0, timer;
    el.querySelector('.x').onclick = function () { el.classList.remove('on'); clearTimeout(timer); ss('cy_sp_off', '1'); };

    function show() {
      if (shown >= MAX_TOASTS || ss('cy_sp_off')) return;
      var r = list[i % list.length]; i++; shown++;
      tx.innerHTML = '<b></b> baru beli <b>Ebook Coach Yoi</b><small><span></span> · <i>✓ pembelian sah</i></small>';
      tx.querySelector('b').textContent = r.n;
      tx.querySelector('small span').textContent = ago(r.t);
      el.classList.add('on');
      timer = setTimeout(function () {
        el.classList.remove('on');
        if (shown < Math.min(MAX_TOASTS, list.length * 2)) timer = setTimeout(show, GAP_MS);
      }, SHOW_MS);
    }
    timer = setTimeout(show, FIRST_DELAY);
  }

  function load() {
    var cached = ss('cy_sp_feed');
    if (cached) { try { var c = JSON.parse(cached); if (Date.now() - c.at < 5 * 6e4) return run(c.data); } catch (e) {} }
    fetch(FEED).then(function (r) { return r.json(); }).then(function (d) {
      ss('cy_sp_feed', JSON.stringify({ at: Date.now(), data: d }));
      run(d);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
})();
