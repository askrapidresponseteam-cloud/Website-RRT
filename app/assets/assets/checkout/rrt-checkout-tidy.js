/* RRT checkout tidy - injected into the vendor's Shopify checkout by the
 * app's WebView once the prefilled page has rendered.
 *
 * WHAT IT DOES
 *   1. Hides the DELIVERY ADDRESS block. The buyer entered that address in
 *      RRT and it is already in the form; they need not see or retype it.
 *   2. Never hides the amount, the order summary, the shipping choice, the
 *      payment method or the Pay button. If the address block's container
 *      would also contain any of those, nothing is hidden at all.
 *   3. Reveals the block again the moment the page marks anything inside it
 *      as an error (an unserviceable PIN, an address the vendor rejects), so
 *      the buyer can fix what the vendor is asking them to fix.
 *   4. Scrolls to the Pay button.
 *
 * WHAT IT NEVER DOES
 *   Remove elements, change values, or submit anything. Hiding is
 *   display:none only, so every field still submits with Pay.
 *
 * DEGRADATION
 *   Shopify's checkout markup is obfuscated and changes without notice. Every
 *   lookup here is by meaning (autocomplete tokens, heading text, button
 *   text), never by class name. If nothing matches, the page is left exactly
 *   as the vendor renders it.
 */
(function () {
  'use strict';
  if (window.__rrtTidy) return;
  window.__rrtTidy = true;

  var STYLE_ID = 'rrt-tidy-style';
  var HIDDEN_ATTR = 'data-rrt-hidden';

  function text(el) { return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function payButton() {
    var nodes = document.querySelectorAll('button');
    for (var i = 0; i < nodes.length; i++) {
      var t = text(nodes[i]);
      if (t === 'pay now' || t.indexOf('pay now') === 0 || t === 'complete order' || t.indexOf('complete order') === 0) return nodes[i];
    }
    return null;
  }

  /** The delivery-address inputs, found by meaning. */
  function addressInputs() {
    var sel = [
      '[autocomplete^="shipping "]',
      'input[name="address1"]', 'input[name="address2"]', 'input[name="city"]',
      'input[name="postalCode"]', 'input[name="zip"]', 'select[name="zone"]',
      'select[name="countryCode"]', 'input[name="firstName"]', 'input[name="lastName"]'
    ].join(',');
    var list = document.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var ac = (el.getAttribute('autocomplete') || '').toLowerCase();
      var nm = (el.getAttribute('name') || '').toLowerCase();
      if (ac.indexOf('billing') === 0) continue;               // never the billing block
      if (ac.indexOf('email') !== -1 || nm === 'email') continue; // contact lives in its own block
      out.push(el);
    }
    return out;
  }

  /** The smallest ancestor holding every address input, stopped before it
   *  would swallow anything the buyer must keep seeing. */
  function addressContainer(inputs) {
    if (!inputs.length) return null;
    var node = inputs[0];
    var pay = payButton();
    function containsAll(el) {
      for (var i = 0; i < inputs.length; i++) if (!el.contains(inputs[i])) return false;
      return true;
    }
    function tooMuch(el) {
      if (pay && el.contains(pay)) return true;
      if (el.querySelector('[autocomplete^="billing"], input[name="number"], input[name="cardNumber"], [name*="payment"], [name="deliveryMethod"], [name*="shipping_rate"], [name*="shippingRate"]')) return true;
      if (el === document.body || el === document.documentElement) return true;
      return false;
    }
    while (node && !containsAll(node)) node = node.parentElement;
    if (!node) return null;
    // Prefer a heading-scoped section if one contains it (tighter than a form).
    var section = node;
    var probe = node;
    while (probe && probe !== document.body) {
      var h = probe.querySelector && probe.querySelector('h1, h2, h3');
      if (h && /^(delivery|shipping address|delivery address)$/.test(text(h)) && probe.contains(node)) { section = probe; }
      probe = probe.parentElement;
    }
    if (tooMuch(section)) section = node;
    if (tooMuch(section)) return null;
    return section;
  }

  function hasError(container) {
    return !!container.querySelector(
      '[aria-invalid="true"], [role="alert"], [aria-live="assertive"], .field__message--error, [id$="-error"], [class*="error"]'
    );
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = '[' + HIDDEN_ATTR + '="1"]{display:none !important}';
    (document.head || document.documentElement).appendChild(s);
  }

  var hidden = null;

  function hide() {
    var inputs = addressInputs();
    if (!inputs.length) return;
    var box = addressContainer(inputs);
    if (!box) return;
    if (hasError(box)) { reveal(); return; }
    ensureStyle();
    box.setAttribute(HIDDEN_ATTR, '1');
    hidden = box;
  }

  function reveal() {
    if (hidden) {
      hidden.removeAttribute(HIDDEN_ATTR);
      try { hidden.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
      hidden = null;
    }
    window.__rrtTidyRevealed = true;
  }

  function scrollToPay() {
    var btn = payButton();
    if (btn) { try { btn.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
  }

  function tick() {
    if (window.__rrtTidyRevealed) return;
    if (hidden && hasError(hidden)) { reveal(); return; }
    if (!hidden) hide();
  }

  // The checkout renders progressively and re-renders after edits.
  tick();
  var observer = null;
  try {
    observer = new MutationObserver(function () { tick(); });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-invalid', 'class', 'role'] });
  } catch (e) {}
  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    tick();
    if (hidden || tries > 30) { clearInterval(timer); scrollToPay(); }
  }, 300);

  window.__rrtTidyApi = { hide: hide, reveal: reveal, hidden: function () { return hidden; } };
})();
