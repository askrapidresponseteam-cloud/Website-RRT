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

    var flags = '';
    if (!p.available) flags += '<span class="flag oos-flag">Sold out</span>';
    else if (cheapest.compareAtPaise && cheapest.compareAtPaise > cheapest.pricePaise) {
      var off = Math.round(((cheapest.compareAtPaise - cheapest.pricePaise) * 100) / cheapest.compareAtPaise);
      if (off > 0) flags += '<span class="flag">' + off + '% off</span>';
    }
    if (p.isRx) flags += '<span class="flag rx-flag">Rx</span>';

    var meta;
    if (!p.available) {
      meta = '<span class="oos">Out of stock</span>';
    } else {
      meta = (p.priceVaries ? 'From ' : '') + money(cheapest.pricePaise) +
        (cheapest.compareAtPaise
          ? ' <span class="was">' + money(cheapest.compareAtPaise) + '</span>' : '');
    }

    return '<article class="product" data-id="' + p.id + '">' +
      '<a href="/shop/p/' + encodeURIComponent(p.handle) + '">' +
      '<div class="product-image">' + img + flags +
      '<button type="button" class="p-heart" data-heart="' + p.id + '" ' +
      'aria-pressed="' + (S.isSaved(p.id) ? 'true' : 'false') + '" aria-label="Save for later">&#9825;</button>' +
      '</div>' +
      '<div class="product-info">' +
      (p.brand ? '<div class="product-brand">' + esc(p.brand) + '</div>' : '') +
      '<h3 class="product-name">' + esc(p.title) + '</h3>' +
      '<div class="product-meta">' + meta + '</div>' +
      '</div></a>' +
      (opts.noAdd ? '' :
        '<button type="button" class="add" data-add="' + p.id + '"' +
        (p.available ? '' : ' aria-disabled="true"') + '>+ Add</button>') +
      '</article>';
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
      var add = e.target.closest ? e.target.closest('[data-add]') : null;
      if (add) {
        e.preventDefault();
        if (add.getAttribute('aria-disabled') === 'true') return;
        var tp = registry[parseInt(add.getAttribute('data-add'), 10)];
        if (!tp) return;
        add.textContent = '\u2026';
        // Tiles are partial (a price range, no variant ids): read the live
        // product before anything can go in the cart.
        S.product(tp.handle).then(function (live) {
          add.textContent = '+ Add';
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
          add.textContent = '+ Add';
          toast(err && err.message ? err.message : 'Something went wrong. Try again.');
        });
      }
    });
  }

  /* ------------------------------------------------------------- chrome */

  /** The header back button: browser history when we own it, the shop
   *  (or the homepage, per data-fallback) when we arrived from outside. */
  function bindBack() {
    var btn = document.querySelector('.site-header .back');
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
    var form = document.querySelector('.site-header .hsearch');
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
    global.addEventListener('rrt:cart', function (e) { paint(e.detail); });
    bindBack();
    bindSearch();
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
          '<div class="store-closed-mark"><span class="material-symbols-outlined" aria-hidden="true">pets</span></div>' +
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
    bindTiles: bindTiles,
    bindHeader: bindHeader,
    toast: toast,
    storeGate: storeGate,
    storeOpenNow: storeOpenNow,
    registry: registry
  };
  /* END PUBLIC API */
})(window);
