/**
 * RRT Shop - who opens the shop and how much they browse (admin console,
 * Store > Visitors). Loaded on every shop page after assets/rrt-shop.js.
 *
 *   open      the first shop page of a visit (a visit ends after 30 quiet
 *             minutes), with where the person came from
 *   view      a product page
 *   checkout  sent on to the partner store's checkout
 *
 * Nobody signs in on the website, so a person is a random id kept in this
 * browser (never a name). The device is what the browser says it is: phone,
 * tablet or computer, the system and the browser. Nothing else is sent: no
 * address, no location, no cart. Backend: POST /store/visit (shop_visits.js).
 * Sent as plain text (a "simple" request: no preflight) so it also goes
 * through when the page is being left.
 */
(function (global) {
  'use strict';

  var API = 'https://asia-south1-rrt-new-backend.cloudfunctions.net/api/store/visit';
  var VISIT_MS = 30 * 60 * 1000;
  var doc = global.document;

  function store(kind) {
    try { var s = global[kind]; s.setItem('rrt_sv_probe', '1'); s.removeItem('rrt_sv_probe'); return s; } catch (e) { return null; }
  }
  var local = store('localStorage');
  var session = store('sessionStorage');

  /** This browser's random id: 24 letters and digits, made once. */
  function visitorId() {
    var id = local && local.getItem('rrt_vid');
    if (id && /^[A-Za-z0-9_-]{16,64}$/.test(id)) return id;
    var bytes = new Uint8Array(18);
    try { global.crypto.getRandomValues(bytes); } catch (e) { for (var i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256); }
    var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    id = '';
    for (var j = 0; j < bytes.length; j++) id += abc[bytes[j] & 63];
    id += abc[(bytes[0] >> 2) & 63] + abc[(bytes[1] >> 2) & 63] + abc[(bytes[2] >> 2) & 63] + abc[(bytes[3] >> 2) & 63] + abc[(bytes[4] >> 2) & 63] + abc[(bytes[5] >> 2) & 63];
    try { if (local) local.setItem('rrt_vid', id); } catch (e) { /* this visit only */ }
    return id;
  }

  /** Phone, tablet or computer; the system; the browser. */
  function device(ua, nav) {
    ua = String(ua || '');
    var touchMac = /Macintosh/.test(ua) && nav && nav.maxTouchPoints > 1;
    var out = { kind: 'desktop', os: 'Other', os_version: '', browser: 'Other' };
    var m;
    if (/iPad/.test(ua) || touchMac) { out.os = 'iPadOS'; out.kind = 'tablet'; }
    else if (/iPhone|iPod/.test(ua)) { out.os = 'iOS'; out.kind = 'phone'; }
    else if (/Android/.test(ua)) { out.os = 'Android'; out.kind = /Mobile/.test(ua) ? 'phone' : 'tablet'; }
    else if (/CrOS/.test(ua)) out.os = 'ChromeOS';
    else if (/Windows/.test(ua)) out.os = 'Windows';
    else if (/Macintosh|Mac OS X/.test(ua)) out.os = 'macOS';
    else if (/Linux/.test(ua)) out.os = 'Linux';
    if ((m = /Android (\d+(?:\.\d+)?)/.exec(ua))) out.os_version = m[1];
    else if ((m = /(?:iPhone OS|CPU OS) (\d+)_(\d+)/.exec(ua))) out.os_version = m[1] + '.' + m[2];
    if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|GSA\//.test(ua)) out.browser = 'In-app';
    else if (/SamsungBrowser/.test(ua)) out.browser = 'Samsung Internet';
    else if (/Edg(e|A|iOS)?\//.test(ua)) out.browser = 'Edge';
    else if (/OPR\/|Opera/.test(ua)) out.browser = 'Opera';
    else if (/Firefox|FxiOS/.test(ua)) out.browser = 'Firefox';
    else if (/Chrome|CriOS/.test(ua)) out.browser = 'Chrome';
    else if (/Safari/.test(ua)) out.browser = 'Safari';
    return out;
  }

  /** Where this visit came from, from the referring page. */
  function entry(referrer, here) {
    var u;
    try { u = referrer ? new URL(referrer) : null; } catch (e) { u = null; }
    if (!u) return { entry: 'direct', from_host: '' };
    if (u.host === here) return { entry: u.pathname === '/' || u.pathname === '' ? 'home' : 'site', from_host: '' };
    var h = u.hostname.toLowerCase();
    if (/(^|\.)(google|bing|duckduckgo|yahoo|ecosia|yandex)\./.test(h)) return { entry: 'search', from_host: h };
    if (/(^|\.)(whatsapp|facebook|fb|instagram|t|x|twitter|linkedin|youtube|telegram|reddit|threads)\.(com|me|co|net|org)$/.test(h) || /^l\.facebook\.com$|^lm\.facebook\.com$/.test(h))
      return { entry: 'social', from_host: h };
    return { entry: 'other', from_host: h };
  }

  function vendorKey() {
    try { var v = global.RRTShop && global.RRTShop.vendor; return v && /^[a-z0-9_-]{1,40}$/.test(v.key) ? v.key : ''; } catch (e) { return ''; }
  }

  var sent = [];   // for tests
  function send(event, extra) {
    var body = { event: event, source: 'web', platform: 'web', visitor: visitorId(), device: device(global.navigator && global.navigator.userAgent, global.navigator), vendor: vendorKey() };
    for (var k in extra || {}) if (Object.prototype.hasOwnProperty.call(extra, k)) body[k] = extra[k];
    var json = JSON.stringify(body);
    sent.push(body);
    try {
      if (global.fetch) {
        global.fetch(API, { method: 'POST', body: json, keepalive: true, headers: { 'Content-Type': 'text/plain;charset=UTF-8' } })
          .catch(function () { /* counting never gets in the way */ });
      } else if (global.navigator && global.navigator.sendBeacon) {
        global.navigator.sendBeacon(API, new Blob([json], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e) { /* counting never gets in the way */ }
  }

  /** A new visit unless one was active in the last 30 minutes. */
  function opened() {
    var now = Date.now();
    var last = session ? Number(session.getItem('rrt_sv_at')) || 0 : 0;
    if (session) session.setItem('rrt_sv_at', String(now));
    if (last && now - last < VISIT_MS) return;
    send('open', entry(doc.referrer, global.location.host));
  }

  opened();
  if (/^\/shop\/p\//.test(global.location.pathname)) send('view', { count: 1 });

  // Sent on to a partner's checkout: every way the pages start it goes
  // through RRTShop.startCheckout.
  var S = global.RRTShop;
  if (S && typeof S.startCheckout === 'function' && !S.startCheckout.__counted) {
    var start = S.startCheckout;
    var counted = function () {
      send('checkout', {});
      return start.apply(this, arguments);
    };
    counted.__counted = true;
    S.startCheckout = counted;
  }

  global.RRTShopVisits = { device: device, entry: entry, sent: sent };
})(window);
