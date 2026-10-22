/*
 * RRT checkout hand-off for a WooCommerce partner store.
 *
 * Runs on the store's own cart page, inside RRT's checkout screen, as the
 * buyer: the cart it fills is the buyer's cart on the store's site (their
 * session cookie), exactly as if they had pressed "Add to cart" on each
 * product. It uses WooCommerce's public Store API - the same calls the
 * store's own block cart makes:
 *
 *   GET    {api}/cart                   the session, and its Nonce
 *   DELETE {api}/cart/items             empty it: one cart, RRT's
 *   POST   {api}/cart/add-item          each line {id, quantity}
 *   POST   {api}/cart/update-customer   the delivery details saved in RRT,
 *                                        so the checkout page opens filled in
 *
 * It never touches payment and never submits the order: the buyer does that
 * on the store's checkout page. Configuration comes from the app in
 * window.__rrtWooFill; the result goes back on the RrtWoo channel as JSON:
 *   { ok: true,  added: n, failed: [{ id, status, message }], customer: bool }
 *   { ok: false, error: "..." }
 *
 * Kept free of anything newer than ES2017 so every Android WebView in use runs it.
 */
(function () {
  'use strict';
  var cfg = window.__rrtWooFill;
  function send(o) {
    try { window.RrtWoo.postMessage(JSON.stringify(o)); } catch (e) { /* the app is gone */ }
  }
  if (!cfg || !cfg.api || !cfg.lines || !cfg.lines.length) { send({ ok: false, error: 'nothing to add' }); return; }

  var nonce = null;
  function req(method, path, body) {
    var headers = { 'Accept': 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    if (nonce) { headers['Nonce'] = nonce; headers['X-WC-Store-API-Nonce'] = nonce; }
    return fetch(cfg.api + path, {
      method: method,
      credentials: 'same-origin',
      headers: headers,
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      var n = r.headers.get('Nonce') || r.headers.get('X-WC-Store-API-Nonce');
      if (n) nonce = n;
      return r.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { /* not JSON */ }
        return { ok: r.ok, status: r.status, json: j };
      });
    });
  }

  var failed = [];
  var added = 0;
  var customer = false;

  req('GET', '/cart').then(function (r) {
    if (!r.ok || !nonce) throw new Error('no cart session (' + r.status + ')');
    return req('DELETE', '/cart/items');
  }).then(function (r) {
    if (!r.ok) throw new Error('could not empty the cart (' + r.status + ')');
    var chain = Promise.resolve();
    cfg.lines.forEach(function (l) {
      chain = chain.then(function () {
        return req('POST', '/cart/add-item', { id: l.id, quantity: l.qty }).then(function (x) {
          if (x.ok) added++;
          else failed.push({ id: l.id, status: x.status, message: x.json && x.json.message ? String(x.json.message) : null });
        });
      });
    });
    return chain;
  }).then(function () {
    var a = cfg.address;
    if (!a || !added) return null;
    // WooCommerce names a few Indian states differently from Shopify; try
    // each spelling the app sends, then none (the buyer picks it there).
    var states = (cfg.states || []).slice();
    states.push('');
    function attempt() {
      var st = states.shift();
      var ship = {
        first_name: a.first_name, last_name: a.last_name, address_1: a.address_1, address_2: a.address_2 || '',
        city: a.city, state: st, postcode: a.postcode, country: 'IN', phone: a.phone
      };
      var bill = {};
      Object.keys(ship).forEach(function (k) { bill[k] = ship[k]; });
      bill.email = a.email;
      return req('POST', '/cart/update-customer', { billing_address: bill, shipping_address: ship }).then(function (x) {
        if (x.ok) { customer = true; return null; }
        return states.length ? attempt() : null;
      });
    }
    return attempt();
  }).then(function () {
    send({ ok: added > 0, added: added, failed: failed, customer: customer });
  }).catch(function (e) {
    send({ ok: false, error: String((e && e.message) || e), added: added, failed: failed });
  });
})();
