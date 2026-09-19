/**
 * RRT Shop — shared page chrome. The tile, the bag count and the toast, so
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
   *  (sale %, sold out, veg, Rx), brand, name, "from" price and a
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
    if (p.isVeg) flags += '<span class="flag veg-flag">Veg</span>';
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
   *  the live default variant — or opens the product page when there is a
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
          if (!live) { toast(S.vendor.name + ' no longer sells this'); return; }
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
  global.RRTUI = {
    tile: tile,
    bindTiles: bindTiles,
    bindHeader: bindHeader,
    toast: toast,
    registry: registry
  };
  /* END PUBLIC API */
})(window);
