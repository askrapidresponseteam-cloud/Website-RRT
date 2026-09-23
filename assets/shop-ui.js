/**
 * RRT Shop - shared page chrome. The tile, the bag count and the toast, so
 * the hub, search results, saved shelf and "you may also like" strip can
 * never draw a product differently. Everything here reads through RRTShop
 * (assets/rrt-shop.js), which must be loaded first.
 */
(function (global) {
  'use strict';

  var S = global.RRTShop;
  var esc = S.esc;

  /* Rendered tiles keep their product objects here so the heart and ADD
   * buttons act on real models, not on data scraped back out of the DOM. */
  var registry = {};

  var PAW = '<svg viewBox="30 42 420 420" aria-hidden="true"><g fill="#434343"><circle cx="85" cy="193" r="45"/><circle cx="177" cy="107" r="45"/><circle cx="302" cy="107" r="45"/><circle cx="395" cy="193" r="45"/><path d="M227 213 L217 216 L211 219 L206 222 L202 225 L199 228 L196 231 L193 234 L190 237 L188 240 L185 243 L183 246 L180 249 L178 252 L176 255 L173 258 L171 261 L169 264 L167 267 L165 270 L163 273 L161 276 L158 279 L156 282 L154 285 L152 288 L150 291 L148 294 L146 297 L143 300 L141 303 L138 306 L136 309 L133 312 L130 315 L127 318 L124 321 L122 324 L119 327 L116 330 L113 333 L110 336 L108 339 L106 342 L103 345 L101 348 L98 351 L96 354 L94 357 L92 360 L91 363 L89 366 L88 369 L87 372 L87 375 L86 378 L86 381 L85 384 L85 387 L85 390 L85 393 L85 396 L86 399 L86 402 L87 405 L88 408 L89 411 L90 414 L92 417 L94 420 L96 423 L98 426 L101 429 L104 432 L108 435 L114 438 L124 441 L124 441 L89 412 L94 422 L99 428 L104 433 L109 436 L114 439 L119 441 L124 442 L129 442 L134 442 L139 442 L144 442 L149 442 L154 442 L159 441 L164 441 L169 440 L174 440 L179 439 L184 438 L189 437 L194 436 L199 436 L204 435 L209 434 L214 434 L219 434 L224 433 L229 433 L234 433 L239 433 L244 433 L249 433 L254 433 L259 434 L264 434 L269 434 L274 435 L279 435 L284 436 L289 437 L294 438 L299 439 L304 439 L309 440 L314 441 L319 441 L324 441 L329 442 L334 442 L339 442 L344 442 L349 442 L354 442 L359 441 L364 439 L369 437 L374 433 L379 429 L384 423 L389 415 L357 441 L357 441 L366 438 L372 435 L376 432 L379 429 L382 426 L384 423 L386 420 L388 417 L390 414 L391 411 L392 408 L393 405 L394 402 L394 399 L395 396 L395 393 L395 390 L395 387 L395 384 L394 381 L394 378 L393 375 L393 372 L392 369 L391 366 L389 363 L388 360 L386 357 L384 354 L382 351 L379 348 L377 345 L374 342 L372 339 L370 336 L367 333 L364 330 L361 327 L358 324 L356 321 L353 318 L350 315 L347 312 L344 309 L342 306 L339 303 L337 300 L335 297 L332 294 L330 291 L328 288 L326 285 L324 282 L322 279 L320 276 L317 273 L315 270 L313 267 L312 264 L310 261 L307 258 L305 255 L302 252 L300 249 L298 246 L295 243 L293 240 L290 237 L287 234 L284 231 L281 228 L278 225 L274 222 L269 219 L263 216 L253 213Z"/></g></svg>';

  function money(p) { return S.money(p); }

  /** One product tile. Same information as the app's tile: image, flags
   *  (sale %, sold out, Rx), brand, name, "from" price and a
   *  strikethrough only where it is honest. */
  function tile(p, opts) {
    opts = opts || {};
    registry[p.id] = p;
    var cheapest = p.cheapestVariant;
    var img = p.imageUrl
      ? '<img src="' + esc(S.sizedImage(p.imageUrl, 480)) + '" alt="" loading="lazy">'
      : '<div class="no-shot" aria-hidden="true"></div>';

    var flags = '', off = 0;
    if (!p.available) flags += '<span class="flag oos-flag">Sold out</span>';
    else if (cheapest.compareAtPaise && cheapest.compareAtPaise > cheapest.pricePaise) {
      off = Math.round(((cheapest.compareAtPaise - cheapest.pricePaise) * 100) / cheapest.compareAtPaise);
      if (off > 0) flags += '<span class="flag">' + off + '% off</span>';
    }
    if (p.isRx) flags += '<span class="flag rx-flag">Rx</span>';

    var meta;
    if (!p.available) {
      meta = '<span class="oos">Out of stock</span>';
    } else {
      meta = (p.priceVaries ? 'From ' : '') + money(cheapest.pricePaise) +
        (cheapest.compareAtPaise
          ? ' <span class="was">' + money(cheapest.compareAtPaise) + '</span>' : '') +
        (off > 0 ? ' <span class="off">' + off + '% off</span>' : '');
    }

    return '<article class="product" data-id="' + p.id + '">' +
      '<a href="/shop/p/' + encodeURIComponent(p.handle) + '">' +
      '<div class="product-image">' + img + flags + '</div>' +
      '<div class="product-info">' +
      (p.brand ? '<div class="product-brand">' + esc(p.brand) + '</div>' : '') +
      '<h3 class="product-name">' + esc(p.title) + '</h3>' +
      '<div class="product-meta">' + meta + '</div>' +
      '</div></a>' +
      '<button type="button" class="p-heart" data-heart="' + p.id + '" ' +
      'aria-pressed="' + (S.isSaved(p.id) ? 'true' : 'false') + '" aria-label="Save for later">&#9825;</button>' +
      (opts.noAdd ? '' : '<div class="p-act" data-act="' + p.id + '">' + actionHtml(p) + '</div>') +
      '</article>';
  }

  /** The buy row: ADD, a stepper once the one variant is in the bag, or
   *  "In bag" when several of its variants are. */
  function actionHtml(p) {
    var lines = S.cart().lines.filter(function (l) { return l.productId === p.id; });
    if (lines.length === 1) {
      return '<div class="step" data-vid="' + lines[0].variantId + '">' +
        '<button type="button" data-step="-1" aria-label="One less">\u2212</button>' +
        '<span>' + lines[0].qty + ' in bag</span>' +
        '<button type="button" data-step="1" aria-label="One more">+</button></div>';
    }
    if (lines.length > 1) {
      var n = lines.reduce(function (a, l) { return a + l.qty; }, 0);
      return '<a class="in-bag" href="/shop/cart">' + n + ' in bag</a>';
    }
    return '<button type="button" class="add" data-add="' + p.id + '"' +
      (p.available ? '' : ' aria-disabled="true"') + '>' + (p.available ? 'Add' : 'Sold out') + '</button>';
  }

  function repaintActions(root) {
    (root || document).querySelectorAll('[data-act]').forEach(function (el) {
      var p = registry[parseInt(el.getAttribute('data-act'), 10)];
      if (p) el.innerHTML = actionHtml(p);
    });
  }

  /** Delegated tile actions on [container]: the heart saves, and + ADD adds
   *  the live default variant - or opens the product page when there is a
   *  choice to make, exactly like the vendor's own "Options" button. */
  function bindTiles(container, onChange) {
    container.addEventListener('click', function (e) {
      var heart = e.target.closest ? e.target.closest('[data-heart]') : null;
      if (heart) {
        e.preventDefault();
        var hp = registry[parseInt(heart.getAttribute('data-heart'), 10)];
        if (!hp) return;
        var nowSaved = S.toggleSaved(hp);
        heart.setAttribute('aria-pressed', nowSaved ? 'true' : 'false');
        toast(nowSaved ? 'Saved for later' : 'Removed from saved');
        if (onChange) onChange('saved', hp, nowSaved);
        return;
      }
      var stepBtn = e.target.closest ? e.target.closest('.step [data-step]') : null;
      if (stepBtn) {
        e.preventDefault();
        var vid = parseInt(stepBtn.parentElement.getAttribute('data-vid'), 10);
        var line = S.cart().lines.filter(function (l) { return l.variantId === vid; })[0];
        if (!line) return;
        var next = line.qty + parseInt(stepBtn.getAttribute('data-step'), 10);
        if (next > line.qty && next > S.qtyCap(line)) { toast('The seller allows max ' + S.qtyCap(line) + ' of this per order'); return; }
        S.setQuantity(vid, next);
        if (next <= 0) toast('Removed from bag');
        return;
      }
      var add = e.target.closest ? e.target.closest('[data-add]') : null;
      if (add) {
        e.preventDefault();
        if (add.getAttribute('aria-disabled') === 'true') return;
        var tp = registry[parseInt(add.getAttribute('data-add'), 10)];
        if (!tp) return;
        add.textContent = 'Adding\u2026';
        // Tiles are partial (a price range, no variant ids): read the live
        // product before anything can go in the cart.
        S.product(tp.handle).then(function (live) {
          add.textContent = 'Add';
          if (!live) { toast('The seller no longer lists this'); return; }
          if (!live.available) { toast('Out of stock'); return; }
          if (live.optionCount > 0 || live.hasChoices) {
            global.location.href = '/shop/p/' + encodeURIComponent(live.handle);
            return;
          }
          S.add(live, live.defaultVariant, 1);
          toast('Added to bag');
          if (onChange) onChange('cart', live, true);
        }).catch(function (err) {
          add.textContent = 'Add';
          toast(err && err.message ? err.message : 'Something went wrong. Try again.');
        });
      }
    });
  }

  /* ------------------------------------------------------------- chrome */

  /** The header back button: browser history when we own it, the shop
   *  (or the homepage, per data-fallback) when we arrived from outside. */
  function bindBack() {
    var btn = document.querySelector('.back');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var cameFromHere = document.referrer.indexOf(location.origin) === 0;
      if (cameFromHere && global.history.length > 1) {
        global.history.back();
      } else {
        location.href = btn.getAttribute('data-fallback') || '/shop';
      }
    });
  }

  /** The header search: the vendor's own suggestions as you type, the full
   *  results page on Enter. One implementation for every page. */
  function bindSearch() {
    var form = document.querySelector('.hsearch');
    if (!form) return;
    var input = form.querySelector('input');
    var suggEl = form.querySelector('.sugg');
    var debounce = null;
    var lastQuery = '';

    input.addEventListener('input', function () {
      var text = input.value.trim();
      clearTimeout(debounce);
      if (text.length < 2) { suggEl.hidden = true; suggEl.innerHTML = ''; return; }
      debounce = setTimeout(function () {
        lastQuery = text;
        S.suggest(text).then(function (r) {
          if (r.query !== lastQuery) return; // a newer keystroke owns the box
          if (!r.products.length && !r.collections.length) { suggEl.hidden = true; return; }
          var out = '';
          r.collections.slice(0, 3).forEach(function (c) {
            out += '<a href="/shop?a=' + encodeURIComponent(c.handle) + '&t=' + encodeURIComponent(c.title) + '">' +
              '<span class="s-shelf">' + esc(c.title) + ' \u2192</span></a>';
          });
          r.products.forEach(function (p) {
            out += '<a href="/shop/p/' + encodeURIComponent(p.handle) + '">' +
              (p.imageUrl ? '<img src="' + esc(S.sizedImage(p.imageUrl, 96)) + '" alt="">' : '') +
              '<span>' + esc(p.title) + '</span>' +
              '<span class="s-price">' + (p.priceVaries ? 'From ' : '') + S.money(p.cheapestVariant.pricePaise) + '</span></a>';
          });
          out += '<a href="/shop?q=' + encodeURIComponent(text) + '"><span class="s-shelf">All results for \u201c' + esc(text) + '\u201d</span></a>';
          suggEl.innerHTML = out;
          suggEl.hidden = false;
        }).catch(function () { suggEl.hidden = true; });
      }, 250);
    });

    document.addEventListener('click', function (e) {
      if (!form.contains(e.target)) suggEl.hidden = true;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (text) location.href = '/shop?q=' + encodeURIComponent(text);
    });
  }

  function bindHeader() {
    var badge = document.getElementById('bagCount');
    function paint(state) {
      if (!badge) return;
      var n = state ? state.count : S.cart().count;
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = n === 0;
    }
    paint();
    global.addEventListener('rrt:cart', function (e) { paint(e.detail); repaintActions(); paintBagBar(e.detail); });
    global.addEventListener('storage', function (e) {
      if (e.key && e.key.indexOf('rrt_store_') === 0) { var st = S.cart(); paint(st); repaintActions(); paintBagBar(st); }
    });
    bindBagBar();
    bindBack();
    bindSearch();
  }

  /** The quick-checkout bar: item count, subtotal and a straight line to
   *  the bag (where delivery is priced and the seller's checkout opens).
   *  Not shown on the bag page itself. */
  var bagbar = null;
  function bindBagBar() {
    if (bagbar || document.body.getAttribute('data-page') === 'cart') return;
    bagbar = document.createElement('div');
    bagbar.className = 'bagbar';
    bagbar.setAttribute('role', 'region');
    bagbar.setAttribute('aria-label', 'Your bag');
    bagbar.innerHTML = '<div class="bb-t" aria-live="polite"></div>' +
      '<a class="bb-view" href="/shop/cart">View bag</a>' +
      '<a class="bb-go" href="/shop/cart?go=1">Checkout \u2192</a>';
    document.body.appendChild(bagbar);
    paintBagBar();
  }
  function paintBagBar(state) {
    if (!bagbar) return;
    state = state || S.cart();
    var on = state.count > 0;
    bagbar.classList.toggle('on', on);
    document.body.classList.toggle('has-bagbar', on);
    if (on) {
      bagbar.querySelector('.bb-t').innerHTML = '<b>' + state.count + (state.count === 1 ? ' item' : ' items') +
        '</b> \u00b7 ' + money(state.subtotalPaise) + ' <span style="opacity:.7">+ delivery</span>';
    }
  }

  var toastTimer = null;
  function toast(message) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
  }

  /* ========================================================== PUBLIC API */
  /** The admin store switches, honoured on every page. `flags.store` false
   *  closes the shop: an overlay explains it and buying is blocked. This
   *  reads RRTStoreConfig (assets/rrt-store-config.js), which live-subscribes
   *  to the same Firestore document the app reads, so an admin flip reaches
   *  open web pages within seconds. Absent config = open, per the app's
   *  defaults, so a config outage never takes the shop down. */
  function storeGate(opts) {
    opts = opts || {};
    var cfg = global.RRTStoreConfig;
    if (!cfg) { if (opts.onOpen) opts.onOpen(); return; }

    var overlay = null;
    function close(message) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'store-closed';
        overlay.innerHTML =
          '<div class="store-closed-card">' +
          '<div class="store-closed-mark">' + PAW + '</div>' +
          '<strong>The shop is closed right now</strong>' +
          '<span class="store-closed-msg"></span>' +
          '<a class="store-closed-home" href="/">Back to Rapid Response</a>' +
          '</div>';
        document.body.appendChild(overlay);
      }
      var msg = overlay.querySelector('.store-closed-msg');
      msg.textContent = message ||
        'We are between updates with our partner store. Please check back shortly.';
      overlay.hidden = false;
    }
    function open() {
      if (overlay) overlay.hidden = true;
    }

    cfg.subscribe(function (s) {
      if (!s.ready) return;              // stay as-is until the first read lands
      if (s.storeOpen) { open(); if (opts.onOpen) opts.onOpen(s); }
      else { close(s.closedMessage); if (opts.onClosed) opts.onClosed(s); }
    });
  }

  /** Whether checkout may proceed right now (shop open). Buttons call this at
   *  press time so a mid-session close is respected. */
  function storeOpenNow() {
    var cfg = global.RRTStoreConfig;
    if (!cfg) return true;
    return cfg.get().storeOpen !== false;
  }

  global.RRTUI = {
    tile: tile,
    repaintActions: repaintActions,
    bindTiles: bindTiles,
    bindHeader: bindHeader,
    toast: toast,
    storeGate: storeGate,
    storeOpenNow: storeOpenNow,
    registry: registry
  };
  /* END PUBLIC API */
})(window);
