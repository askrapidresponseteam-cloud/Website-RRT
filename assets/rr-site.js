/* Rapid Response - shared site chrome behaviour.
   One language for the whole site (stored under every key the older pages
   read), the Get-the-app menu, and the bag count on shop pages. Pages keep
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
    var langBox = document.querySelector('.rr-lang');
    if (langBox) {
      // Pages with no bilingual content get no switch rather than a dead one.
      if (typeof window.setLang !== 'function' && !document.querySelector('[data-lang=hi]')) langBox.hidden = true;
      langBox.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-l]');
        if (b) apply(b.getAttribute('data-l'));
      });
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
})();
