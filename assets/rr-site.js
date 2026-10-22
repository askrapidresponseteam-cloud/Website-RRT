/* Rapid Response - shared site chrome behaviour.
   One language for the whole site (stored under every key the older pages
   read), the Get-the-app menu, the phone menu, and the bag count on shop pages. Pages keep
   their own setLang(); this only calls it. */
(function () {
  'use strict';
  var PLAY = 'https://play.google.com/store/apps/details?id=com.rrt.sos';
  var IOS = 'https://apps.apple.com/in/app/rapid-response/id6758672498';
  var ua = navigator.userAgent || '';
  var isAndroid = /Android/i.test(ua), isIOS = /iPhone|iPad|iPod/i.test(ua);

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function stored() { var l = get('lang') || get('rr-lang'); return l === 'hi' ? 'hi' : 'en'; }
  function remember(l) { set('lang', l); set('rr-lang', l); set('rr', l); }

  /* Header and footer labels follow <html lang>, whoever changes it. */
  function paint() {
    var l = document.documentElement.lang === 'hi' ? 'hi' : 'en';
    document.querySelectorAll('[data-rr-en]').forEach(function (el) {
      el.textContent = el.getAttribute(l === 'hi' ? 'data-rr-hi' : 'data-rr-en');
    });
    document.querySelectorAll('.rr-lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-l') === l ? 'true' : 'false');
    });
  }
  function apply(l) {
    remember(l);
    if (typeof window.setLang === 'function') {
      try { window.setLang(l); } catch (e) { /* page's own switch failed; still relabel */ }
    }
    document.documentElement.lang = l;
    paint();
  }

  function init() {
    // The header's switch, and the same switch in the phone menu.
    var bilingual = typeof window.setLang === 'function' || !!document.querySelector('[data-lang=hi]');
    var warmed = false;
    // Fetch the Hindi weights as soon as a reader reaches for the switch, so the
    // page redraws in Hindi without a blank moment while they download.
    var warm = function () {
      if (warmed || !document.fonts || !document.fonts.load) return;
      warmed = true;
      ['400', '500', '600', '700'].forEach(function (w) {   // 700 is only on /vet; elsewhere it resolves to 600
        document.fonts.load(w + ' 16px "Noto Sans Devanagari"', 'अa').catch(function () {});
      });
    };
    document.querySelectorAll('.rr-lang').forEach(function (langBox) {
      // Pages with no bilingual content get no switch rather than a dead one.
      if (!bilingual) langBox.hidden = true;
      langBox.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-l]');
        if (b) apply(b.getAttribute('data-l'));
      });
      ['pointerenter', 'pointerdown', 'focusin'].forEach(function (t) { langBox.addEventListener(t, warm, { passive: true }); });
    });

    // Phones: the Menu button opens the nav links in a panel under the header.
    var mb = document.getElementById('rrMenuBtn'), mob = document.getElementById('rrMob');
    if (mb && mob) {
      var setMob = function (open) {
        mob.hidden = !open;
        mb.setAttribute('aria-expanded', open ? 'true' : 'false');
        mb.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
        document.documentElement.classList.toggle('rr-mob-open', open);
      };
      mb.addEventListener('click', function (e) { e.stopPropagation(); setMob(mob.hidden); });
      mob.addEventListener('click', function (e) { if (e.target.closest('a')) setMob(false); });
      document.addEventListener('click', function (e) {
        if (!mob.hidden && !mob.contains(e.target) && !mb.contains(e.target)) setMob(false);
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mob.hidden) { setMob(false); mb.focus(); } });
      window.addEventListener('resize', function () { if (window.innerWidth > 760 && !mob.hidden) setMob(false); });
    }
    if (window.MutationObserver) {
      new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    }
    if (stored() === 'hi' && document.documentElement.lang !== 'hi' && typeof window.setLang === 'function') apply('hi');
    else paint();

    var btn = document.getElementById('rrAppBtn'), menu = document.getElementById('rrAppMenu');
    if (btn && menu) {
      btn.addEventListener('click', function (e) {
        if (isAndroid) { location.href = PLAY; return; }
        if (isIOS) { location.href = IOS; return; }
        e.stopPropagation();
        var open = menu.classList.toggle('rr-open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      document.addEventListener('click', function (e) {
        if (!menu.contains(e.target)) { menu.classList.remove('rr-open'); btn.setAttribute('aria-expanded', 'false'); }
      });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu.classList.remove('rr-open'); });
    }

    /* The shop switch (flags.store in app_config/flags, set in the admin
       panel; the same switch the app reads). When the shop is off, every way
       into it disappears from the site (header, phone menu, home page and its
       search), exactly as the app hides its shop tab; shop pages send a
       visitor home (assets/shop-ui.js). Only an explicit "off" hides it: no
       answer, an error or a missing field keeps the shop. The answer is kept
       on this device, so the next page hides the links before it paints
       (the line in rr:head), and asked again at most every few minutes.
       The document is public to read (Firestore rules), so the read needs
       no sign-in. */
    var SHOP_KEY = 'rrt_store_open', SHOP_AT = 'rrt_store_open_at';
    var FLAGS_DOC = 'https://firestore.googleapis.com/v1/projects/rrt-new-backend/databases/(default)/documents/app_config/flags';
    var shopFlag = function (open) {
      document.documentElement.classList.toggle('rr-shop-off', !open);
      set(SHOP_KEY, open ? 'true' : 'false');
      set(SHOP_AT, String(Date.now()));
      try { window.dispatchEvent(new CustomEvent('rr-shop', { detail: { open: open } })); } catch (e) { /* old browser */ }
    };
    if (window.RRTStoreConfig) {
      window.RRTStoreConfig.subscribe(function (sc) { if (sc.ready) shopFlag(sc.storeOpen !== false); });
    } else if (window.fetch && Date.now() - (Number(get(SHOP_AT)) || 0) > 3 * 60 * 1000) {
      fetch(FLAGS_DOC, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.fields) return;
          var f = d.fields['flags.store'];
          shopFlag(!(f && f.booleanValue === false));
        })
        .catch(function () { /* offline: keep what this device last knew */ });
    }

    var badge = document.getElementById('bagCount');
    if (badge && !window.RRTShop) {
      // Not a shop page: read the bag straight from storage.
      try {
        var raw = JSON.parse(localStorage.getItem('rrt_store_cart_v2') || '[]');
        var n = (Array.isArray(raw) ? raw : (raw.lines || [])).reduce(function (a, l) { return a + (l.qty || 0); }, 0);
        badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = n === 0;
      } catch (e) { badge.hidden = true; }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  /* No right-click menu on the site. This deters casual copying; it is not a
     security control (anything a browser shows can still be saved). Kept:
     - text fields, so people can still paste an address or a phone number;
     - a long-press on a phone (a touch or pen "right-click"), which is how
       people select and copy a helpline number or share a link. */
  // Browsers that report a long-press as a plain mouse event (Safari, Firefox
  // on Android) are told apart by the finger that just touched the screen.
  var lastTouch = 0;
  var noteTouch = function () { lastTouch = Date.now(); };
  document.addEventListener('touchstart', noteTouch, { capture: true, passive: true });
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') noteTouch();
  }, { capture: true, passive: true });
  document.addEventListener('contextmenu', function (e) {
    if (e.pointerType === 'touch' || e.pointerType === 'pen') return;
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (e.mozInputSource === 5 || Date.now() - lastTouch < 1500) return;
    var t = e.target;
    if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
    e.preventDefault();
  }, true);
})();
