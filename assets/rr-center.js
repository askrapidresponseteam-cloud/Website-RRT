/* Rapid Response - optical centring for capsules and buttons, site-wide.
   Two things push button labels off centre, whatever the font:
   1. letter-spacing adds space after the LAST letter too, so spaced
      uppercase labels sit left by half a letter-space;
   2. a line box is taller than the capitals, and not symmetrically, so
      caps ride high or low depending on the font's ascent and descent.
   The label is wrapped in one span that cancels the trailing space
   (negative end margin = the letter-spacing) and, inside flex buttons, is
   trimmed to cap height and baseline (CSS text-box), so the capitals sit
   exactly in the middle in every browser font. Runs again whenever a
   script rewrites a label. Purely visual: text and clicks are untouched. */
(function () {
  'use strict';
  if (window.__rrCenter) return; window.__rrCenter = true;
  var TRIM = window.CSS && CSS.supports && CSS.supports('text-box', 'trim-both cap alphabetic');
  var SEL = 'a, button, [role=button], .flag, .chip, .category, .in-bag, .tag';
  var st = document.createElement('style');
  st.textContent = '.rr-oc{white-space:nowrap;pointer-events:none}' +
    '.rr-oc-b{display:block}' + (TRIM ? '.rr-oc-t{text-box:trim-both cap alphabetic}' : '');
  (document.head || document.documentElement).appendChild(st);

  function capsule(el, cs) {
    var r = el.getBoundingClientRect();
    if (r.height < 14 || r.height > 72 || r.width > 560) return false;
    var bg = cs.backgroundColor;
    var bw = Math.min(parseFloat(cs.borderTopWidth) || 0, parseFloat(cs.borderBottomWidth) || 0,
                      parseFloat(cs.borderLeftWidth) || 0, parseFloat(cs.borderRightWidth) || 0);
    return (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') || bw > 0;
  }
  /* One line of text now? Multi-line labels are left exactly as they are. */
  function oneLine(el) {
    try {
      var rg = document.createRange(); rg.selectNodeContents(el);
      var rects = rg.getClientRects(), tops = {};
      for (var i = 0; i < rects.length; i++) if (rects[i].width > 0) tops[Math.round(rects[i].top / 4)] = 1;
      return Object.keys(tops).length <= 1;
    } catch (e) { return false; }
  }
  var INLINE = /^(SPAN|B|STRONG|I|EM|SMALL|SVG|IMG|BR)$/;
  function centred(cs) {
    return /flex|grid/.test(cs.display) && (cs.alignItems === 'center' || cs.alignItems === 'normal' && /grid/.test(cs.display));
  }
  function onlyText(el) {
    var t = '', n = el.firstChild;
    for (; n; n = n.nextSibling) {
      if (n.nodeType === 3) t += n.nodeValue; else if (n.nodeType !== 8) return null;
    }
    return t.trim() ? t : null;
  }
  var seen = typeof WeakSet === 'function' ? new WeakSet() : null;
  function fix(el) {
    if (seen && seen.has(el)) return;
    if (el.closest('.rr-noc') || el.querySelector('.rr-oc')) return;
    var cs = getComputedStyle(el);
    if (cs.display === 'none') return;
    if (!capsule(el, cs)) { if (seen && el.getBoundingClientRect().height > 0) seen.add(el); return; }
    var ls = parseFloat(cs.letterSpacing) || 0;
    if (!oneLine(el)) return;
    var kids = el.childNodes, hasEl = false, hasLangPair = false;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.nodeType === 1) {
        if (!INLINE.test(k.tagName.toUpperCase())) return;   // real structure inside: leave it
        hasEl = true;
        if (k.hasAttribute && k.hasAttribute('data-lang')) hasLangPair = true;
      }
    }
    var text = onlyText(el);
    if (!hasEl && text == null) return;
    var flex = centred(cs);
    // Bilingual labels (<span data-lang=en>/<span data-lang=hi>): the page's
    // own CSS shows one and hides the other, often with child selectors, so
    // they are not moved; each just gets its trailing letter-space cancelled.
    if (hasLangPair) {
      Array.prototype.forEach.call(el.children, function (c) { if (ls) c.style.marginRight = (-ls) + 'px'; c.classList.add('rr-oc'); if (flex) c.classList.add('rr-oc-t'); });
      return;
    }
    if (text != null && !hasEl) {
      var span = document.createElement('span');
      span.className = 'rr-oc' + (flex ? ' rr-oc-b rr-oc-t' : '');
      span.textContent = text.replace(/^\s+|\s+$/g, '');
      if (ls) span.style.marginRight = (-ls) + 'px';
      el.textContent = '';
      el.appendChild(span);
      return;
    }
    // Icon + label (and similar): every child is already its own flex item
    // with the page's gap between them, so nothing is regrouped. Loose text
    // becomes a span, labels are trimmed to cap height so they centre on the
    // icon and the button, and the last label drops its trailing space.
    var last = null;
    Array.prototype.slice.call(el.childNodes).forEach(function (k) {
      if (k.nodeType === 3) {
        if (!k.nodeValue.trim()) return;
        var sp = document.createElement('span'); sp.className = 'rr-oc';
        sp.textContent = k.nodeValue.trim(); el.replaceChild(sp, k); k = sp;
      }
      if (k.nodeType !== 1 || k.tagName.toUpperCase() !== 'SPAN' || k.children.length) return;
      if (/material-symbols|icon/.test(k.className)) return;
      k.classList.add('rr-oc');
      if (flex) k.classList.add('rr-oc-t');
      last = k;
    });
    if (last && ls) last.style.marginRight = (-ls) + 'px';
  }
  var queued = false, pending = [];
  function run() {
    queued = false;
    var list = pending.length ? pending : [document];
    pending = [];
    list.forEach(function (root) {
      if (root.nodeType !== 1 && root !== document) return;
      if (root !== document && root.matches && root.matches(SEL)) fix(root);
      if (root.querySelectorAll) root.querySelectorAll(SEL).forEach(fix);
    });
  }
  function queue(node) { pending.push(node); if (!queued) { queued = true; requestAnimationFrame(run); } }
  function start() {
    queue(document);
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        var t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!t || (t.classList && t.classList.contains('rr-oc'))) return;
        var host = t.closest ? (t.closest(SEL) || t) : t;
        queue(host);
      });
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    // Hidden-at-load buttons (menus, sheets, tabs) get their turn once shown.
    window.addEventListener('load', function () { queue(document); });
    document.addEventListener('click', function () { setTimeout(function () { queue(document); }, 60); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
