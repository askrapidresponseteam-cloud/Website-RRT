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

  var PAW = '<svg viewBox="30 42 420 420" aria-hidden="true"><g fill="#434343"><circle cx="85" cy="193" r="45"/><circle cx="177" cy="107" r="45"/><circle cx="302" cy="107" r="45"/><circle cx="395" cy="193" r="45"/><path d="M378.5 348.1C381 351.2 384.7 354.5 386.7 357.8C388.7 361.1 389.5 364.5 390.7 368C391.9 371.5 393.3 375.2 394 378.9C394.6 382.5 394.6 386.1 394.5 389.7C394.5 393.3 394.5 397 393.9 400.5C393.2 404 391.9 407.4 390.6 410.7C389.2 414 387.6 417.2 385.7 420.2C383.8 423.2 381.5 426.1 378.9 428.6C376.4 431.2 373.6 433.6 370.5 435.6C367.3 437.6 364.1 439.6 360.1 440.7C356.1 441.7 350.8 441.6 346.3 441.8C341.8 441.9 337.5 442 333.2 441.8C328.9 441.6 324.5 440.9 320.6 440.6C316.7 440.3 313.2 440.1 309.8 439.8C306.4 439.4 303.2 439.2 300.1 438.8C296.9 438.3 293.7 437.4 290.8 436.9C287.9 436.4 285.2 436 282.6 435.6C280.1 435.2 277.6 434.8 275.3 434.5C273 434.2 270.7 434 268.6 433.8C266.5 433.7 264.5 433.8 262.4 433.6C260.4 433.5 258.3 433.1 256.4 433C254.4 432.8 252.6 432.9 250.7 432.9C248.8 432.9 246.9 433 245.1 432.9C243.2 432.9 241.4 432.6 239.5 432.6C237.7 432.6 235.8 432.9 234 432.9C232.1 433 230.2 432.9 228.4 432.9C226.5 432.9 224.6 432.8 222.6 433C220.7 433.1 218.6 433.5 216.6 433.6C214.6 433.8 212.6 433.7 210.4 433.8C208.3 434 206.1 434.2 203.7 434.5C201.4 434.8 199 435.2 196.4 435.6C193.8 436 191.2 436.4 188.3 436.9C185.4 437.4 182.1 438.3 179 438.8C175.8 439.2 172.6 439.4 169.2 439.8C165.8 440.1 162.3 440.3 158.4 440.6C154.5 440.9 150.1 441.6 145.8 441.8C141.5 442 137.2 442 132.7 441.8C128.3 441.5 123.4 441.4 119.3 440.4C115.3 439.3 111.8 437.6 108.6 435.6C105.3 433.7 102.6 431.2 100.1 428.6C97.5 426.1 95.3 423.2 93.3 420.2C91.4 417.2 89.8 414 88.5 410.7C87.1 407.4 85.8 404 85.2 400.5C84.5 397 84.5 393.3 84.5 389.7C84.5 386.1 84.4 382.5 85 378.9C85.7 375.2 87.1 371.5 88.3 368C89.5 364.5 90.4 361.1 92.3 357.8C94.3 354.5 97.5 351.2 100 348.1C102.5 345.1 105.1 342.2 107.3 339.5C109.5 336.7 110.9 334 113.1 331.5C115.3 329 118.1 326.7 120.3 324.4C122.6 322.1 124.5 320 126.5 317.8C128.4 315.7 130.2 313.6 132 311.6C133.9 309.6 135.7 307.8 137.4 305.8C139.1 303.9 140.7 302 142.2 300.1C143.7 298.2 145.1 296.3 146.4 294.4C147.7 292.4 148.7 290.2 150.1 288.4C151.6 286.6 153.6 285.1 155 283.3C156.4 281.4 157.3 279.1 158.7 277.2C160.1 275.4 162.1 274 163.5 272.1C164.9 270.2 166 267.9 167.3 265.8C168.6 263.7 169.9 261.3 171.3 259.3C172.8 257.2 174.5 255.3 176.2 253.3C177.8 251.3 179.6 249.4 181.3 247.2C183 245.1 184.6 242.6 186.4 240.5C188.3 238.4 190.4 236.7 192.4 234.5C194.5 232.3 196.3 229.5 198.5 227.4C200.7 225.3 203.2 223.8 205.7 222.1C208.2 220.4 210.8 218.5 213.5 217.2C216.2 215.9 219 215.1 221.9 214.3C224.7 213.5 227.7 212.8 230.6 212.4C233.6 212.1 236.5 212.1 239.5 212.1C242.5 212.1 245.5 212.1 248.4 212.4C251.3 212.8 254.3 213.5 257.1 214.3C260 215.1 262.9 215.9 265.6 217.2C268.2 218.5 270.8 220.4 273.3 222.1C275.8 223.8 278.3 225.3 280.5 227.4C282.7 229.5 284.6 232.3 286.6 234.5C288.6 236.7 290.6 238.5 292.6 240.5C294.5 242.5 296.6 244.2 298.3 246.4C300 248.5 301.3 251.2 302.8 253.3C304.4 255.5 306.2 257.3 307.7 259.3C309.2 261.3 310.6 263.4 312 265.4C313.5 267.4 314.8 269.4 316.2 271.4C317.6 273.4 319 275.3 320.3 277.2C321.6 279.2 322.6 281.4 324 283.3C325.4 285.1 327.5 286.6 328.9 288.4C330.3 290.2 331.3 292.4 332.6 294.4C333.9 296.3 335.3 298.2 336.8 300.1C338.3 302 340 303.9 341.6 305.8C343.2 307.8 344.7 309.8 346.5 311.8C348.3 313.8 350.5 315.7 352.5 317.8C354.6 319.9 356.4 322.1 358.7 324.4C360.9 326.7 363.7 329 365.9 331.5C368.1 334 369.6 336.7 371.7 339.5C373.8 342.2 376 345.1 378.5 348.1Z"/></g></svg>';

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

    // Voice: the browser turns speech into text (on-device where it can,
    // see rr-voice.js); the words then run the normal search.
    if (global.RRVoice && global.RRVoice.supported()) {
      var micBtn = document.createElement('button');
      micBtn.type = 'button'; micBtn.className = 'mic'; micBtn.hidden = true;
      micBtn.setAttribute('aria-label', 'Search the shop by voice');
      micBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/>' +
        '<path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
      form.insertBefore(micBtn, form.querySelector('button[type=submit]'));
      var placeholder = input.placeholder;
      global.RRVoice.attach(micBtn, {
        lang: function () { return document.documentElement.lang === 'hi' ? 'hi-IN' : 'en-IN'; },
        pick: function (alts) {
          // Shop searches are product words: drop the spoken lead-in.
          return alts[0];
        },
        onStart: function (m) { input.value = ''; input.placeholder = m === 'local' ? 'Listening on this device\u2026' : 'Listening\u2026 say a product or brand'; },
        onInterim: function (t) { input.value = t; },
        onFinal: function (t) {
          input.value = t.replace(/^(?:(?:please|ok|okay)\s+)*(?:(?:show|find|get|give)(?: me)?|search(?: for)?|look(?:ing)? for|i (?:want|need)(?: to buy)?|buy|order)\s+/i, '').trim() || t;
        },
        onEnd: function (heard) {
          input.placeholder = placeholder;
          if (heard && input.value.trim()) location.href = '/shop?q=' + encodeURIComponent(input.value.trim());
        },
        onError: function (code) {
          input.placeholder = placeholder;
          toast({ 'not-allowed': 'Microphone is blocked. Allow it for this site in your browser settings.',
                  'service-not-allowed': 'Microphone is blocked. Allow it for this site in your browser settings.',
                  'no-speech': 'Didn\u2019t catch that. Tap the mic and try again.',
                  'audio-capture': 'No microphone found on this device.',
                  'network': 'Voice search needs an internet connection.' }[code] || 'Voice search stopped. Tap the mic to try again.');
        },
        onNote: function () { toast('Your browser turns speech into text. Rapid Response never receives your audio.'); }
      });
    }

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
    // After a backend store switch the page reloads once; say why the bag is empty.
    try {
      if (global.sessionStorage.getItem('rrt_store_changed')) {
        global.sessionStorage.removeItem('rrt_store_changed');
        setTimeout(function () { toast('The shop now sells from a new partner store. Items from the previous store were removed from your bag.'); }, 400);
      }
    } catch (e) { /* storage blocked */ }
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
