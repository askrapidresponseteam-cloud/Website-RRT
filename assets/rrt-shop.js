/**
 * RRT Shop - storefront client. THE WEB TWIN OF THE APP'S STORE.
 *
 * This is a JavaScript port of the mobile app's vendor layer:
 *
 *   client/lib/core/store/vendor.dart               → Vendor, shelves, aisles
 *   client/lib/core/models/store_models.dart        → money, parsing, rules, cart
 *   client/lib/core/services/vendor_storefront.dart → the live-store client
 *
 * Like the app, there is NO RRT SERVER IN THE LOOP. The browser reads Pets
 * Lifestyle's live Shopify store directly and hands checkout to their own
 * payment page, carrying the same cart attributes (source, rrt_ref) that the
 * app sends - so the backend order ledger counts web orders the same way it
 * counts app orders.
 *
 * ONE TRANSPORT DIFFERENCE, forced by the browser: the app reads the vendor's
 * `/collections/....json` and `/products/....js` endpoints, which do not send
 * CORS headers and therefore cannot be fetched cross-origin from a web page.
 * The web client instead uses Shopify's public Storefront API - the same
 * tokenless GraphQL endpoint the app already uses for full search - which is
 * CORS-open and serves the identical live data: products, collections, search
 * and recommendations. Same store, same prices, same stock; different door.
 *
 * MONEY IS ALWAYS INTEGER PAISE, parsed from text and never through a float,
 * shown to the paisa when the vendor prices to the paisa (₹117.19).
 * Anything that decides money is read fresh; everything else may be cached
 * for three minutes, exactly the app's rule.
 */
(function (global) {
  'use strict';

  /* ================================================================ VENDOR */

  var Vendor = {
    /** Canonical storefront host. The bare domain redirects. */
    domain: 'www.pets-lifestyle.com',
    /** Numeric Shopify shop id; order status pages live under /{shopId}/orders/. */
    shopId: '71290126637',
    /** Permanent Shopify domain; the Storefront API is served here whatever
     *  the vendor does with their custom domain. */
    myshopifyDomain: '08e8df.myshopify.com',
    /** Shopify "tokenless access": products, collections, search - no key to
     *  issue or leak. A retired version keeps answering as the oldest
     *  supported one, so this does not silently break when Shopify moves on. */
    storefrontApiVersion: '2026-01',
    /** Support contacts as published in the vendor's own site footer. */
    supportWhatsApp: '919301820282',
    supportEmail: 'info@pets-lifestyle.com',
    /** Shopify's built-in collection of everything the vendor has published. */
    catalogHandle: 'all'
  };

  Vendor.url = function (path, query) {
    var u = 'https://' + Vendor.domain + path;
    if (query) {
      var qs = Object.keys(query)
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
        .join('&');
      if (qs) u += '?' + qs;
    }
    return u;
  };
  Vendor.storefrontApiUrl =
    'https://' + Vendor.myshopifyDomain + '/api/' + Vendor.storefrontApiVersion + '/graphql.json';
  /** The vendor's storefront feeds, reached same-origin: Vercel rewrites
   *  /pl-api/* to https://www.pets-lifestyle.com/*, which is what lets a
   *  browser read the EXACT endpoints the app reads (their JSON feeds send
   *  no CORS headers, so a cross-origin fetch would be blocked; a
   *  same-origin path has no CORS at all). */
  Vendor.proxyBase = '/pl-api';
  Vendor.feedUrl = function (path, query) {
    var u = Vendor.proxyBase + path;
    if (query) {
      var qs = Object.keys(query)
        .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(query[k]); })
        .join('&');
      if (qs) u += '?' + qs;
    }
    return u;
  };
  Vendor.accountUrl = Vendor.url('/account');
  Vendor.shippingPolicyUrl = Vendor.url('/policies/shipping-policy');
  Vendor.refundPolicyUrl = Vendor.url('/policies/refund-policy');
  Vendor.productUrl = function (handle) { return Vendor.url('/products/' + handle); };
  Vendor.whatsAppUrl = function (message) {
    return 'https://wa.me/' + Vendor.supportWhatsApp +
      (message ? '?text=' + encodeURIComponent(message) : '');
  };

  /* The ten shelves and their 71 aisle handles, verbatim from the app
   * (vendor.dart, verified 17 Sep 2026 against the vendor's own navigation).
   * The grouping and names are RRT's; the products inside each aisle are
   * whatever the vendor has in that collection right now. */
  var SHELVES = [
    { key: 'pharmacy', num: '01', name: 'Pharmacy', aisles: [
      ['Flea & Tick', 'dog-fleas-ticks'], ['Deworming', 'dewormers'],
      ['Antibiotics', 'antibiotics'], ['Skin & Allergy', 'skin-care-for-dogs'],
      ['Wound Care', 'wound-care'], ['Gut & Liver', 'gut-and-liver-care-for-dogs'],
      ['Diarrhoea', 'diarrhea'], ['Pain & Joints', 'pain-relief-arthritis-for-dogs'],
      ['Ear & Eye', 'ear-eye-care'], ['Anxiety & Calming', 'anxiety-calming'],
      ['Kidney', 'renal-kidney-care'], ['Urinary', 'urinary-tract-infections'],
      ['Heart', 'cardiac-care'], ['Antifungal', 'anti-fungal'],
      ['Cat Flea & Tick', 'tick-flea-cat'], ['Cat Deworming', 'deworming-tablets-for-cats']
    ] },
    { key: 'supplements', num: '02', name: 'Supplements', aisles: [
      ['Calcium', 'calcium-for-dogs'], ['Multivitamins', 'dog-growth-and-multivitamins'],
      ['Skin & Coat', 'skin-coat-tonic'], ['Probiotics', 'probiotics-prebiotics'],
      ['Immunity', 'immunity-boosters'], ['Weaning', 'weaning-supplement'],
      ['Blood & Platelets', 'hematinic-platelet-boosters'], ['For Cats', 'supplements-for-cats']
    ] },
    { key: 'dog-food', num: '03', name: 'Dog Food', aisles: [
      ['All', 'dog-food'], ['Dry', 'dry-dog-food'], ['Wet', 'wet-food'],
      ['Puppy', 'puppy-food'], ['Vet Diets', 'veterinary-and-therapeutic-diets'],
      ['Milk Replacers', 'puppy-milk-replacers'], ['Grain Free', 'grain-free-food'],
      ['Hypoallergenic', 'hypoallergenic-food']
    ] },
    { key: 'cat-food', num: '04', name: 'Cat Food', aisles: [
      ['All', 'food-cat'], ['Wet', 'wet-cat-food'], ['Dry', 'cat-dry-food'],
      ['Kitten', 'kitten-food-cat'], ['Vet Diet', 'veterinary-diet-cat']
    ] },
    { key: 'treats', num: '05', name: 'Treats', aisles: [
      ['Dog Treats', 'dog-treats'], ['Vegetarian', 'vegetarian-treats'],
      ['Biscuits', 'biscuits'], ['Dental', 'dental-treats'],
      ['Chews', 'soft-hard-chews'], ['Puppy', 'puppy-treats'], ['Cat Treats', 'cat-treats']
    ] },
    { key: 'grooming', num: '06', name: 'Grooming', aisles: [
      ['Shampoos', 'dog-shampoos-conditioners'], ['Tick & Flea', 'tick-flea'],
      ['Brushes', 'brushes-combs'], ['Towels & Wipes', 'towels-wipes'],
      ['Paw Care', 'paw-care'], ['Oral Care', 'oral-care'],
      ['Cat Litter', 'cat-litter-products'], ['Pads & Diapers', 'training-pads-diapers']
    ] },
    { key: 'gear', num: '07', name: 'Toys & Gear', aisles: [
      ['Dog Toys', 'dog-toys'], ['Cat Toys', 'toys-cat'], ['Collars', 'dog-collars'],
      ['Leashes', 'leashes'], ['Harnesses', 'harnesses'], ['Beds', 'beds'],
      ['Bowls', 'bowls-diners'], ['Crates & Carriers', 'crates-carriers']
    ] },
    { key: 'small-pets', num: '08', name: 'Birds, Fish & Small Pets', aisles: [
      ['Birds', 'bird-supplies'], ['Fish', 'fish-aquatic'], ['Turtles', 'tortoise-turtles'],
      ['Rabbits', 'rabbits'], ['Guinea Pigs', 'guinea-pig'], ['Hamsters', 'hamster']
    ] },
    { key: 'farm', num: '09', name: 'Farm & Livestock', aisles: [
      ['All', 'farm-livestock-supplies'], ['Cattle', 'cow-healthcare'],
      ['Poultry', 'chicken-vitamins-healthcare'], ['Horse', 'horse-and-wellness-products']
    ] },
    { key: 'sale', num: '10', name: 'Sale', aisles: [
      ['Clearance', 'clearance-sale']
    ] }
  ].map(function (s) {
    s.aisles = s.aisles.map(function (a) { return { label: a[0], handle: a[1] }; });
    s.preview = (function () {
      var head = s.aisles.slice(0, 3).map(function (a) { return a.label; }).join(' \u00b7 ');
      var rest = s.aisles.length - 3;
      return rest > 0 ? head + ' +' + rest : head;
    })();
    return s;
  });

  function shelfByKey(key) {
    for (var i = 0; i < SHELVES.length; i++) if (SHELVES[i].key === key) return SHELVES[i];
    return null;
  }
  function shelfForAisle(handle) {
    for (var i = 0; i < SHELVES.length; i++) {
      var a = SHELVES[i].aisles;
      for (var j = 0; j < a.length; j++) if (a[j].handle === handle) return SHELVES[i];
    }
    return null;
  }

  /* ================================================================= MONEY */

  /** `123400` → `₹1,234`; `11719` → `₹117.19`. Indian digit grouping. */
  function formatPaise(paise) {
    var negative = paise < 0;
    var abs = Math.abs(paise);
    var digits = String(Math.floor(abs / 100));
    var rem = abs % 100;
    var grouped;
    if (digits.length <= 3) {
      grouped = digits;
    } else {
      var last3 = digits.slice(-3);
      var rest = digits.slice(0, -3);
      var parts = [];
      while (rest.length > 2) {
        parts.unshift(rest.slice(-2));
        rest = rest.slice(0, -2);
      }
      parts.unshift(rest);
      grouped = parts.join(',') + ',' + last3;
    }
    var frac = rem === 0 ? '' : '.' + String(rem).padStart(2, '0');
    return (negative ? '-' : '') + '\u20b9' + grouped + frac;
  }

  /** "245.00" / "245" / 245.5 → paise. Parsed as text, not through a double,
   *  so "0.29" is 29 paise and never 28.999… Null for anything unparseable. */
  function paiseFromDecimal(value) {
    if (value == null) return null;
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return value * 100;
      return Math.round(value * 100);
    }
    var s = String(value).trim().replace(/,/g, '');
    var m = /^(\d+)(?:\.(\d{1,2})\d*)?$/.exec(s);
    if (!m) return null;
    var frac = (m[2] || '').padEnd(2, '0');
    return parseInt(m[1], 10) * 100 + parseInt(frac || '0', 10);
  }

  /** Integer subunits (24500 == ₹245). Tolerates a numeric string. */
  function paiseFromSubunits(value) {
    if (value == null) return null;
    if (typeof value === 'number') return Math.round(value);
    var n = parseInt(String(value).trim(), 10);
    return isNaN(n) ? null : n;
  }

  /* ================================================================ IMAGES */

  /** Shopify hands out "//cdn…" and "/cdn/shop/…" forms. Make them absolute. */
  function absoluteImageUrl(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    if (s.indexOf('//') === 0) return 'https:' + s;
    if (s.charAt(0) === '/') return 'https://' + Vendor.domain + s;
    if (s.indexOf('http://') === 0) return 'https://' + s.slice(7);
    return s;
  }

  /** Ask Shopify's image CDN for a smaller rendition. A grid tile does not
   *  need the 2000px original. */
  function sizedImageUrl(url, width) {
    if (!url) return url;
    var isShopifyCdn = url.indexOf('shopify') !== -1 || url.indexOf('/cdn/shop/') !== -1;
    if (!isShopifyCdn) return url;
    if (/[?&]width=\d+/.test(url)) return url.replace(/([?&]width=)\d+/, '$1' + width);
    var sep = url.indexOf('?') === -1 ? '?' : '&';
    return url + sep + 'width=' + width;
  }

  /* ============================================== LABELS FROM THEIR WORDS */
  /* Whole-word matches only. Substring matching is how "shampoo" becomes
   * ham, "delivery" becomes liver and "veggie" becomes egg. */

  var RE_RX = /\bschedule[\s-]*h\b|\bprescription[\s-]+(only|drug|medicine|medication|product|veterinary)\b|\bveterinary\s+prescription\b|\brx[\s-]+only\b/i;
  var RE_VEG_WORD = /\b(veg|vegetarian|vegan|plant[\s-]based|meat[\s-]free)\b/i;
  var RE_NON_VEG = /\b(chicken|mutton|lamb|beef|pork|bacon|turkey|duck|venison|goat meat|salmon|tuna|sardines?|mackerel|anchov(y|ies)|prawns?|shrimps?|crab|krill|seafood|fish|fish oil|cod liver|eggs?|yolk|liver|tripe|jerky|rawhide|bully sticks?|pizzle|meat|meaty|poultry|gelatine?|bone broth|non[\s-]?veg(etarian)?)\b/i;
  /** Toys and gear are not food; a plush duck is not a duck. */
  var RE_NOT_FOOD = /\b(toys?|plush|squeaky|ball|rope|collar|leash|harness|bed|bowl|crate|carrier|brush|comb|shampoo|litter|scratcher|cage|aquarium)\b/i;
  /** Words that make gear edible after all: "chicken flavoured dental chew". */
  var RE_EDIBLE = /\b(flavou?r(ed|s)?|chews?|treats?|dental|jerky|biscuits?|food|meal|gravy|broth|sticks?)\b/i;

  function plainHead(html, max) {
    var text = String(html || '').replace(/<[^>]*>/g, ' ');
    return text.length > max ? text.slice(0, max) : text;
  }

  var Rules = {
    isRx: function (p) {
      return RE_RX.test(p.tags.join(' ') + ' ' + p.productType + ' ' + plainHead(p.descriptionHtml, 6000));
    },
    isVeg: function (p) {
      var head = p.title + ' ' + p.tags.join(' ') + ' ' + p.productType;
      return RE_VEG_WORD.test(head) && !RE_NON_VEG.test(p.title);
    },
    /** Used only when the veg-only flag is on. Hides products whose title,
     *  type, tags or opening description name an animal ingredient. */
    hideWhenVegOnly: function (p) {
      var head = p.title + ' ' + p.productType + ' ' + p.tags.join(' ');
      if (RE_NOT_FOOD.test(head) && !RE_EDIBLE.test(p.title)) return false;
      if (RE_VEG_WORD.test(head) && !RE_NON_VEG.test(p.title)) return false;
      return RE_NON_VEG.test(head + ' ' + plainHead(p.descriptionHtml, 600));
    }
  };

  /* =========================================================== DESCRIPTION */

  var NAMED_ENTITIES = {
    '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'",
    '&apos;': "'", '&nbsp;': ' ', '&rsquo;': '\u2019', '&lsquo;': '\u2018',
    '&rdquo;': '\u201d', '&ldquo;': '\u201c', '&ndash;': '\u2013', '&mdash;': '\u2014',
    '&hellip;': '\u2026', '&reg;': '\u00ae', '&trade;': '\u2122', '&copy;': '\u00a9',
    '&deg;': '\u00b0', '&times;': '\u00d7', '&frac12;': '\u00bd', '&bull;': '\u2022'
  };

  /** House style holds even for the vendor's text: dashes render plain. */
  function dashFree(text) {
    return String(text)
      .replace(/\s*\u2014\s*/g, ' - ')
      .replace(/\u2013/g, '-');
  }

  function decodeHtmlEntities(s) {
    var out = String(s).replace(/&#(x?[0-9a-fA-F]+);/g, function (whole, g) {
      var code = (g[0] === 'x' || g[0] === 'X') ? parseInt(g.slice(1), 16) : parseInt(g, 10);
      if (!code || code <= 0 || code > 0x10FFFF) return whole;
      return String.fromCodePoint(code);
    });
    Object.keys(NAMED_ENTITIES).forEach(function (k) {
      out = out.split(k).join(NAMED_ENTITIES[k]);
    });
    return dashFree(out);
  }

  /** The vendor's product HTML, reduced to blocks RRT sets in its own type:
   *  headings, paragraphs and bullets. Everything else - inline styles,
   *  spans, tables, scripts - is flattened. Rendering blocks instead of the
   *  vendor's raw HTML is also what keeps their markup out of our DOM. */
  function descriptionBlocks(html, maxBlocks) {
    maxBlocks = maxBlocks || 160;
    if (!html || !String(html).trim()) return [];
    var s = String(html)
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      // A short paragraph that is entirely bold is a heading in practice.
      .replace(/<p[^>]*>\s*<(strong|b)[^>]*>([^<]{1,60})<\/(strong|b)>\s*:?\s*<\/p>/gi,
        function (m, t1, text) { return '\n\u0001H' + text + '\n'; })
      .replace(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi,
        function (m, text) { return '\n\u0001H' + text + '\n'; })
      .replace(/<li[^>]*>/gi, '\n\u0001B')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/?(p|div|ul|ol|li|tr|table|tbody|thead|section|article)[^>]*>/gi, '\n')
      .replace(/<\/t[dh]>/gi, ' \u00b7 ')
      .replace(/<[^>]*>/g, '');
    s = decodeHtmlEntities(s);

    var blocks = [];
    var lines = s.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/[ \t\u00A0]+/g, ' ').trim();
      if (!line) continue;
      var kind = 'paragraph';
      if (line.indexOf('\u0001H') === 0) { kind = 'heading'; line = line.slice(2).trim(); }
      else if (line.indexOf('\u0001B') === 0) { kind = 'bullet'; line = line.slice(2).trim(); }
      line = line.split('\u0001').join('').replace(/^[\u00b7\u2022\-\s]+/, '').trim();
      if (!line || line === '\u00b7') continue;
      blocks.push({ kind: kind, text: line });
      if (blocks.length >= maxBlocks) break;
    }
    return blocks;
  }

  /* ================================================================ MODELS */

  function gidTail(gid) {
    var s = String(gid || '');
    var n = parseInt(s.slice(s.lastIndexOf('/') + 1), 10);
    return isNaN(n) ? null : n;
  }

  /** A compare-at price at or below the price is not a sale, it is noise. */
  function realCompareAt(compareAt, price) {
    return (compareAt != null && compareAt > price) ? compareAt : null;
  }

  function moneyAmount(node) {
    return node && node.amount != null ? paiseFromDecimal(node.amount) : null;
  }

  /** A full variant from a Storefront API ProductVariant node. */
  function variantFromGraph(node, optionNames) {
    var id = gidTail(node.id);
    var price = moneyAmount(node.price);
    if (id == null || price == null) return null;
    var selected = node.selectedOptions || [];
    var byName = {};
    selected.forEach(function (o) { if (o && o.name != null) byName[o.name] = String(o.value); });
    var optionValues = [];
    if (optionNames && optionNames.length) {
      optionNames.forEach(function (n) { if (byName[n] != null) optionValues.push(byName[n]); });
    } else {
      selected.forEach(function (o) { if (o && o.value != null) optionValues.push(String(o.value)); });
    }
    var rule = node.quantityRule;
    var max = rule && rule.maximum != null ? paiseFromSubunits(rule.maximum) : null;
    return {
      id: id,
      title: String(node.title || ''),
      optionValues: optionValues,
      pricePaise: price,
      compareAtPaise: realCompareAt(moneyAmount(node.compareAtPrice), price),
      // Absent means sellable: a missing field should never quietly turn a
      // whole shelf into "sold out".
      available: node.availableForSale !== false,
      imageUrl: node.image ? absoluteImageUrl(node.image.url) : null,
      maxQty: (max != null && max > 0) ? max : null
    };
  }

  /** Stand-in variants for a partial product (tile / search result / saved
   *  snapshot): enough to draw "from ₹X" and a sale price. Id 0 is never
   *  purchasable; the product page loads the real variants first. */
  function previewVariants(min, max, compareAt, available) {
    var top = (max != null && max > min) ? max : null;
    var out = [{
      id: 0, title: 'Default Title', optionValues: [],
      pricePaise: min,
      // Only a single-price product can show a strikethrough honestly: the
      // feed gives the highest compare-at, and setting that against the
      // lowest price of a range would overstate the discount.
      compareAtPaise: (top == null && compareAt != null && compareAt > min) ? compareAt : null,
      available: available !== false
    }];
    if (top != null) {
      out.push({ id: 0, title: 'Default Title', optionValues: [], pricePaise: top, available: available !== false });
    }
    return out;
  }

  /** A tile from a Storefront API product node carrying price ranges
   *  (collection pages, search results, recommendations). */
  function productFromGraphTile(node) {
    var id = gidTail(node.id);
    var handle = String(node.handle || '');
    if (id == null || !handle) return null;
    function amount(range, key) {
      return range && range[key] ? paiseFromDecimal(range[key].amount) : null;
    }
    var min = amount(node.priceRange, 'minVariantPrice');
    if (min == null) return null;
    var image = node.featuredImage ? absoluteImageUrl(node.featuredImage.url) : null;
    return wrapProduct({
      id: id,
      handle: handle,
      title: String(node.title || '').trim(),
      brand: String(node.vendor || '').trim(),
      productType: String(node.productType || ''),
      tags: [],
      descriptionHtml: '',
      images: image ? [image] : [],
      options: [],
      variants: previewVariants(
        min,
        amount(node.priceRange, 'maxVariantPrice'),
        amount(node.compareAtPriceRange, 'maxVariantPrice'),
        node.availableForSale !== false
      ),
      partial: true,
      createdAtMs: node.publishedAt ? Date.parse(node.publishedAt) || null : null
    });
  }

  /** The full product from a Storefront API product node with variants. */
  function productFromGraphFull(node) {
    var id = gidTail(node.id);
    var handle = String(node.handle || '');
    if (id == null || !handle) return null;
    var optionNames = (node.options || []).map(function (o) { return String(o.name || ''); });
    var variantNodes = node.variants && node.variants.nodes ? node.variants.nodes : [];
    var variants = variantNodes.map(function (v) { return variantFromGraph(v, optionNames); })
      .filter(Boolean);
    if (!variants.length) return null;
    var images = (node.images && node.images.nodes ? node.images.nodes : [])
      .map(function (i) { return absoluteImageUrl(i.url); })
      .filter(Boolean);
    if (!images.length && node.featuredImage) {
      var f = absoluteImageUrl(node.featuredImage.url);
      if (f) images.push(f);
    }
    var tags = Array.isArray(node.tags) ? node.tags.map(String) : [];
    return wrapProduct({
      id: id,
      handle: handle,
      title: String(node.title || '').trim(),
      brand: String(node.vendor || '').trim(),
      productType: String(node.productType || ''),
      tags: tags,
      descriptionHtml: String(node.descriptionHtml || ''),
      images: images,
      options: optionNames.map(function (n) { return { name: n, values: [] }; }),
      variants: variants,
      partial: false,
      createdAtMs: node.publishedAt ? Date.parse(node.publishedAt) || null : null
    });
  }

  /** Attach the app's derived accessors so pages read one shape. */
  function wrapProduct(p) {
    p.imageUrl = p.images.length ? p.images[0] : null;
    p.available = p.variants.some(function (v) { return v.available; });
    p.hasChoices = p.variants.length > 1;
    p.priceVaries = (function () {
      var seen = {};
      p.variants.forEach(function (v) { seen[v.pricePaise] = true; });
      return Object.keys(seen).length > 1;
    })();
    p.defaultVariant = (function () {
      for (var i = 0; i < p.variants.length; i++) if (p.variants[i].available) return p.variants[i];
      return p.variants[0];
    })();
    /** The cheapest variant still for sale (or the cheapest at all when sold
     *  out) - what "from ₹X" means on the vendor's own grid. */
    p.cheapestVariant = (function () {
      var pool = p.variants.filter(function (v) { return v.available; });
      var list = pool.length ? pool : p.variants;
      return list.reduce(function (a, b) { return a.pricePaise <= b.pricePaise ? a : b; });
    })();
    p.isRx = Rules.isRx(p);
    p.isVeg = Rules.isVeg(p);
    p.variantById = function (variantId) {
      for (var i = 0; i < p.variants.length; i++) if (p.variants[i].id === variantId) return p.variants[i];
      return null;
    };
    /** The choices for option [index]: the vendor's option list when it
     *  carries values, otherwise read off the variants in their order  - 
     *  the order their own product page shows. */
    p.valuesForOption = function (index) {
      if (index < p.options.length && p.options[index].values.length) return p.options[index].values;
      var seen = [];
      p.variants.forEach(function (v) {
        if (index < v.optionValues.length && seen.indexOf(v.optionValues[index]) === -1) {
          seen.push(v.optionValues[index]);
        }
      });
      return seen;
    };
    p.optionCount = (function () {
      if (p.variants.length <= 1 && p.variants[0] &&
          p.variants[0].title.trim().toLowerCase() === 'default title') return 0;
      var n = p.options.length;
      p.variants.forEach(function (v) { if (v.optionValues.length > n) n = v.optionValues.length; });
      return n;
    })();
    p.variantMatching = function (selection) {
      outer: for (var i = 0; i < p.variants.length; i++) {
        var v = p.variants[i];
        if (v.optionValues.length !== selection.length) continue;
        for (var j = 0; j < selection.length; j++) {
          if (v.optionValues[j] !== selection[j]) continue outer;
        }
        return v;
      }
      return null;
    };
    /** Whether any sellable variant has [value] for option [index], given the
     *  other options as currently selected. Drives struck-through chips. */
    p.isValueAvailable = function (index, value, selection) {
      for (var i = 0; i < p.variants.length; i++) {
        var v = p.variants[i];
        if (!v.available || index >= v.optionValues.length) continue;
        if (v.optionValues[index] !== value) continue;
        var ok = true;
        for (var j = 0; j < selection.length && j < v.optionValues.length; j++) {
          if (j !== index && v.optionValues[j] !== selection[j]) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    };
    /** Minimal record for the SAVED shelf. Rebuilt into a partial product. */
    p.toSnapshot = function () {
      return {
        id: p.id, handle: p.handle, title: p.title, brand: p.brand,
        image: p.imageUrl,
        price: p.cheapestVariant.pricePaise,
        compare_at: p.cheapestVariant.compareAtPaise,
        available: p.available
      };
    };
    return p;
  }

  function productFromSnapshot(m) {
    if (!m || typeof m !== 'object') return null;
    var id = paiseFromSubunits(m.id);
    var handle = String(m.handle || '');
    var price = paiseFromSubunits(m.price);
    if (id == null || !handle || price == null) return null;
    return wrapProduct({
      id: id, handle: handle,
      title: String(m.title || ''), brand: String(m.brand || ''),
      productType: '', tags: [], descriptionHtml: '',
      images: m.image ? [m.image] : [], options: [],
      variants: [{
        id: 0, title: 'Default Title', optionValues: [],
        pricePaise: price,
        compareAtPaise: paiseFromSubunits(m.compare_at),
        available: m.available !== false
      }],
      partial: true, createdAtMs: null
    });
  }

  /* ================================================ VENDOR FEED PARSERS */
  /* The app's parsers, ported line for line (store_models.dart):
   *  - /collections/{handle}/products.json: prices as decimal strings
   *    ("245.00"), images as objects with `src`, description in body_html.
   *  - /products/{handle}.js and /recommendations/products.json: prices as
   *    integer paise (24500), plus per-variant quantity rules.
   *  - /search/suggest.json: price_min/max as decimals, partial products. */

  function feedOptionValues(m) {
    var out = [];
    ['option1', 'option2', 'option3'].forEach(function (k) {
      if (m[k] != null && String(m[k]) !== '') out.push(String(m[k]));
    });
    return out;
  }

  function variantFromFeed(m) {
    var id = paiseFromSubunits(m.id);
    var price = paiseFromDecimal(m.price);
    if (id == null || price == null) return null;
    var featured = m.featured_image;
    return {
      id: id,
      title: String(m.title || ''),
      optionValues: feedOptionValues(m),
      pricePaise: price,
      compareAtPaise: realCompareAt(paiseFromDecimal(m.compare_at_price), price),
      // Absent means sellable: the feed always sends it, and a missing field
      // should never quietly turn a whole shelf into "sold out".
      available: m.available !== false,
      imageUrl: featured && typeof featured === 'object' ? absoluteImageUrl(featured.src) : null,
      maxQty: null
    };
  }

  function variantFromAjax(m) {
    var id = paiseFromSubunits(m.id);
    var price = paiseFromSubunits(m.price);
    if (id == null || price == null) return null;
    var featured = m.featured_image;
    var rule = m.quantity_rule;
    var max = rule && typeof rule === 'object' ? paiseFromSubunits(rule.max) : null;
    return {
      id: id,
      title: String(m.title || ''),
      optionValues: feedOptionValues(m),
      pricePaise: price,
      compareAtPaise: realCompareAt(paiseFromSubunits(m.compare_at_price), price),
      available: m.available !== false,
      imageUrl: featured && typeof featured === 'object' ? absoluteImageUrl(featured.src) : null,
      maxQty: (max != null && max > 0) ? max : null
    };
  }

  function feedTags(raw) {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    }
    return [];
  }

  function feedOptions(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (o) {
      if (o && typeof o === 'object') {
        return {
          name: String(o.name || ''),
          values: Array.isArray(o.values) ? o.values.map(String) : []
        };
      }
      return { name: String(o), values: [] };
    });
  }

  function feedImages(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map(function (i) {
      return absoluteImageUrl(i && typeof i === 'object' ? i.src : i);
    }).filter(Boolean);
  }

  /** From /collections/{handle}/products.json. */
  function productFromFeed(m) {
    if (!m || typeof m !== 'object') return null;
    var id = paiseFromSubunits(m.id);
    var handle = String(m.handle || '');
    if (id == null || !handle) return null;
    var variants = (Array.isArray(m.variants) ? m.variants : [])
      .map(variantFromFeed).filter(Boolean);
    if (!variants.length) return null;
    var published = Date.parse(String(m.published_at || m.created_at || ''));
    return wrapProduct({
      id: id,
      handle: handle,
      title: String(m.title || '').trim(),
      brand: String(m.vendor || '').trim(),
      productType: String(m.product_type || ''),
      tags: feedTags(m.tags),
      descriptionHtml: String(m.body_html || ''),
      images: feedImages(m.images),
      options: feedOptions(m.options),
      variants: variants,
      partial: false,
      createdAtMs: isNaN(published) ? null : published
    });
  }

  /** From /products/{handle}.js or /recommendations/products.json. */
  function productFromAjax(m) {
    if (!m || typeof m !== 'object') return null;
    var id = paiseFromSubunits(m.id);
    var handle = String(m.handle || '');
    if (id == null || !handle) return null;
    var variants = (Array.isArray(m.variants) ? m.variants : [])
      .map(variantFromAjax).filter(Boolean);
    if (!variants.length) return null;
    var images = feedImages(m.images);
    if (!images.length && m.featured_image != null) {
      var f = absoluteImageUrl(m.featured_image);
      if (f) images.push(f);
    }
    return wrapProduct({
      id: id,
      handle: handle,
      title: String(m.title || '').trim(),
      brand: String(m.vendor || '').trim(),
      productType: String(m.type || m.product_type || ''),
      tags: feedTags(m.tags),
      descriptionHtml: String(m.description || m.body_html || ''),
      images: images,
      options: feedOptions(m.options),
      variants: variants,
      partial: false,
      createdAtMs: null
    });
  }

  /** From a /search/suggest.json product: a partial tile. */
  function productFromSuggest(m) {
    if (!m || typeof m !== 'object') return null;
    var id = paiseFromSubunits(m.id);
    var handle = String(m.handle || '');
    if (id == null || !handle) return null;
    var min = paiseFromDecimal(m.price_min);
    if (min == null) min = paiseFromDecimal(m.price);
    if (min == null) return null;
    var featured = m.featured_image != null ? m.featured_image : m.image;
    var image = absoluteImageUrl(featured && typeof featured === 'object' ? featured.url : featured);
    return wrapProduct({
      id: id,
      handle: handle,
      title: decodeHtmlEntities(String(m.title || '').trim()),
      brand: String(m.vendor || '').trim(),
      productType: String(m.type || ''),
      tags: feedTags(m.tags),
      descriptionHtml: '',
      images: image ? [image] : [],
      options: [],
      variants: previewVariants(
        min,
        paiseFromDecimal(m.price_max),
        paiseFromDecimal(m.compare_at_price_max),
        m.available !== false
      ),
      partial: true,
      createdAtMs: null
    });
  }

  /* ==================================================== SIZE SIBLINGS */
  /* The vendor sometimes publishes each size of a product as its own
   * listing ("... 2 Kg", "... 12 Kg") instead of as variants of one.
   * These helpers group such sibling listings so the product page can
   * offer every size in one place - each chip linking to the vendor's
   * real listing at its own live price. Pure functions: the page feeds
   * them the current product plus search results for the base title. */

  var SIZE_UNITS = {
    kg: ['wt', 1000], kgs: ['wt', 1000], g: ['wt', 1], gm: ['wt', 1],
    gms: ['wt', 1], gram: ['wt', 1], grams: ['wt', 1],
    l: ['vol', 1000], ltr: ['vol', 1000], litre: ['vol', 1000],
    litres: ['vol', 1000], liter: ['vol', 1000], liters: ['vol', 1000],
    ml: ['vol', 1], tab: ['ct', 1], tabs: ['ct', 1], tablet: ['ct', 1],
    tablets: ['ct', 1], cap: ['ct', 1], caps: ['ct', 1],
    capsule: ['ct', 1], capsules: ['ct', 1], pc: ['ct', 1], pcs: ['ct', 1],
    piece: ['ct', 1], pieces: ['ct', 1]
  };
  var SIZE_RE = /(\d+(?:[.,]\d+)?)\s*(kgs?|gms?|grams?|g|ml|ltr|litres?|liters?|l|tabs?|tablets?|caps?|capsules?|pcs?|pieces?)\b\.?/gi;

  /** The LAST size token in a title - sizes trail ("UltraHypo 12 Kg"). */
  function parseSize(title) {
    var t = String(title || '');
    var m, last = null;
    SIZE_RE.lastIndex = 0;
    while ((m = SIZE_RE.exec(t)) !== null) last = m;
    if (!last) return null;
    var unit = SIZE_UNITS[last[2].toLowerCase()];
    if (!unit) return null;
    var n = parseFloat(last[1].replace(',', '.'));
    if (!(n > 0)) return null;
    var base = (t.slice(0, last.index) + ' ' + t.slice(last.index + last[0].length))
      .replace(/\(\s*\)/g, ' ')
      .replace(/[\s\-– - ,·|]+/g, ' ')
      .trim();
    return {
      base: base.toLowerCase(),
      label: last[0].replace(/\s+/g, ' ').replace(/\.$/, '').trim(),
      family: unit[0],
      value: n * unit[1]
    };
  }

  /** Sibling listings of [current] among [candidates]: same base title,
   *  same brand where both name one. Two or more sizes, sorted small to
   *  large, or [] - a lone size is not a family. */
  function sizeSiblings(current, candidates) {
    var own = current && parseSize(current.title);
    if (!own) return [];
    var brandKey = String(current.brand || '').trim().toLowerCase();
    var seen = {};
    var out = [];
    var pool = [current].concat(candidates || []);
    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (!p || !p.handle || seen[p.handle]) continue;
      var ps = parseSize(p.title);
      if (!ps || ps.base !== own.base) continue;
      var pBrand = String(p.brand || '').trim().toLowerCase();
      if (brandKey && pBrand && pBrand !== brandKey) continue;
      seen[p.handle] = true;
      out.push({
        handle: p.handle,
        label: ps.label,
        family: ps.family,
        value: ps.value,
        pricePaise: p.cheapestVariant ? p.cheapestVariant.pricePaise : null,
        available: p.available !== false,
        current: p.handle === current.handle
      });
    }
    if (out.length < 2) return [];
    var famRank = { wt: 0, vol: 1, ct: 2 };
    out.sort(function (a, b) {
      return (famRank[a.family] - famRank[b.family]) || (a.value - b.value);
    });
    return out;
  }

  /* ============================================== VISIBLE PRODUCTS (BROWSE) */

  var SORTS = ['featured', 'newest', 'priceLow', 'priceHigh'];
  var SORT_LABELS = { featured: 'FEATURED', newest: 'NEWEST', priceLow: 'PRICE LOW', priceHigh: 'PRICE HIGH' };

  /** What the grid shows: the vendor's products after the user's filters and
   *  sort. Pure, so the rules are testable without a screen. */
  function visibleProducts(products, opts) {
    opts = opts || {};
    var visible = products.filter(function (p) {
      if (opts.inStockOnly && !p.available) return false;
      if (opts.vegOnly && Rules.hideWhenVegOnly(p)) return false;
      return true;
    });
    switch (opts.sort) {
      case 'priceLow':
        visible.sort(function (a, b) { return a.cheapestVariant.pricePaise - b.cheapestVariant.pricePaise; });
        break;
      case 'priceHigh':
        visible.sort(function (a, b) { return b.cheapestVariant.pricePaise - a.cheapestVariant.pricePaise; });
        break;
      case 'newest':
        // Products the feed did not date sort last, keeping relative order.
        visible.sort(function (a, b) { return (b.createdAtMs || 0) - (a.createdAtMs || 0); });
        break;
    }
    return visible;
  }

  /* =============================================================== STORAGE */
  /* Same keys as the phone (store_*_v2 on device), namespaced for the web.
   * Guarded throughout: private mode or quota never breaks a page. */

  var CART_KEY = 'rrt_store_cart_v2';
  var SAVED_KEY = 'rrt_store_saved_v2';
  var RECEIPTS_KEY = 'rrt_store_receipts_v2';
  var VEG_KEY = 'rrt_store_veg_only';
  var CAPS_KEY = 'rrt_sf_caps_v1';
  var CACHE_PREFIX = 'rrt_sf_cache_v1:';

  function memStore() {
    var m = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
      key: function (i) { return Object.keys(m)[i] || null; },
      get length() { return Object.keys(m).length; }
    };
  }

  function safeStore(kind) {
    try {
      var s = kind === 'session' ? global.sessionStorage : global.localStorage;
      var probe = '__rrt_probe__';
      s.setItem(probe, '1'); s.removeItem(probe);
      return s;
    } catch (e) {
      return memStore();
    }
  }

  var local = safeStore('local');
  var session = safeStore('session');

  function readJson(store, key, fallback) {
    try {
      var raw = store.getItem(key);
      if (raw == null) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (e) { return fallback; }
  }
  function writeJson(store, key, value) {
    try { store.setItem(key, JSON.stringify(value)); } catch (e) { /* full / private */ }
  }

  /* ================================================================= CACHE */
  /* Three minutes, like the app: keeps back-navigation instant without ever
   * showing a price that has had time to go stale. Anything that decides
   * money bypasses it. sessionStorage, so it survives page navigations but
   * dies with the tab. */

  var CACHE_TTL_MS = 3 * 60 * 1000;

  function cacheGet(key) {
    var entry = readJson(session, CACHE_PREFIX + key, null);
    if (!entry || typeof entry.at !== 'number') return undefined;
    if (Date.now() - entry.at > CACHE_TTL_MS) {
      try { session.removeItem(CACHE_PREFIX + key); } catch (e) { /* ignore */ }
      return undefined;
    }
    return entry.v;
  }
  function cacheSet(key, value) {
    try {
      session.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), v: value }));
    } catch (e) {
      cacheClear(); // quota: drop the whole cache, it is only a cache
      try { session.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), v: value })); } catch (e2) { /* give up */ }
    }
  }
  function cacheRemove(key) {
    try { session.removeItem(CACHE_PREFIX + key); } catch (e) { /* ignore */ }
  }
  function cacheClear() {
    try {
      var doomed = [];
      for (var i = 0; i < session.length; i++) {
        var k = session.key(i);
        if (k && k.indexOf(CACHE_PREFIX) === 0) doomed.push(k);
      }
      doomed.forEach(function (k) { session.removeItem(k); });
    } catch (e) { /* ignore */ }
  }

  /* ============================================================= TRANSPORT */

  /** A failure worth telling the user about, in words they can act on.
   *  The copy is the app's, word for word. */
  function StorefrontError(message, status) {
    var err = new Error(message);
    err.name = 'StorefrontError';
    err.status = status || null;
    err.storefront = true;
    return err;
  }

  var TIMEOUT_MS = 20 * 1000;
  /** Max wait for the native cart before the permalink goes out instead. */
  var HANDOFF_DEADLINE_MS = 3500;

  var fetchImpl = function () { return global.fetch.apply(global, arguments); };

  /** GET/POST [url], expect JSON, with the app's timeout and error copy. */
  function fetchJson(url, init) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);
    init = init || {};
    if (controller) init.signal = controller.signal;
    return fetchImpl(url, init).then(function (res) {
      clearTimeout(timer);
      if (res.status === 404) throw StorefrontError('Not found', 404);
      if (res.status === 429 || res.status === 430) {
        throw StorefrontError('The store is busy right now. Try again in a moment.', res.status);
      }
      if (res.status !== 200) {
        throw StorefrontError('The store could not load this right now (' + res.status + ').', res.status);
      }
      return res.json().catch(function () {
        // Their storefront answered with a page, not data - usually a bot
        // challenge or maintenance screen in front of the JSON.
        throw StorefrontError('The store sent something unexpected. Try again shortly.');
      });
    }).catch(function (e) {
      clearTimeout(timer);
      if (e && e.storefront) throw e;
      if (e && e.name === 'AbortError') {
        throw StorefrontError('The store is taking too long to answer. Try again.');
      }
      throw StorefrontError('Could not reach the store. Check your internet and try again.');
    });
  }

  /** GET a vendor feed through the same-origin proxy, with the 3-minute
   *  cache unless the answer decides money ([fresh]). */
  function feedGet(path, query, opts) {
    opts = opts || {};
    var url = Vendor.feedUrl(path, query);
    if (!opts.fresh) {
      var hit = cacheGet('feed|' + url);
      if (hit !== undefined) return Promise.resolve(hit);
    }
    return fetchJson(url, { headers: { 'Accept': 'application/json' } }).then(function (body) {
      cacheSet('feed|' + url, body);
      return body;
    });
  }

  /* Which door listings use this session: the Storefront API ('sf', sorted
   * server-side) until it misbehaves, then the vendor's feeds ('feeds')  - 
   * the app's own endpoints, which are also the door of last resort for
   * every other read. Found necessary in production on 19 Sep 2026, when
   * the API answered the catalogue with an empty collection. */
  var TRANSPORT_KEY = 'rrt_sf_transport';
  function transport() {
    try { return session.getItem(TRANSPORT_KEY) === 'feeds' ? 'feeds' : 'sf'; }
    catch (e) { return 'sf'; }
  }
  function useFeeds() {
    try { session.setItem(TRANSPORT_KEY, 'feeds'); } catch (e) { /* ignore */ }
  }

  function gql(query, variables, opts) {
    opts = opts || {};
    var cacheKey = opts.cacheKey || null;
    if (cacheKey && !opts.fresh) {
      var hit = cacheGet(cacheKey);
      if (hit !== undefined) return Promise.resolve(hit);
    }

    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT_MS);

    return fetchImpl(Vendor.storefrontApiUrl, {
      method: 'POST',
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query, variables: variables || {} }),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (res.status === 429 || res.status === 430) {
        throw StorefrontError('The store is busy right now. Try again in a moment.', res.status);
      }
      if (res.status === 404) throw StorefrontError('Not found', 404);
      if (res.status !== 200) {
        throw StorefrontError('The store could not load this right now (' + res.status + ').', res.status);
      }
      return res.json().catch(function () {
        // Their storefront answered with a page, not data - usually a bot
        // challenge or maintenance screen in front of the JSON.
        throw StorefrontError('The store sent something unexpected. Try again shortly.');
      });
    }).then(function (body) {
      if (!body || typeof body !== 'object') {
        throw StorefrontError('The store sent something unexpected. Try again shortly.');
      }
      if (Array.isArray(body.errors) && body.errors.length) {
        var err = StorefrontError('The store could not load this right now.');
        err.graphQLErrors = body.errors;
        throw err;
      }
      if (cacheKey) cacheSet(cacheKey, body.data);
      return body.data;
    }).catch(function (e) {
      clearTimeout(timer);
      if (e && e.storefront) throw e;
      if (e && e.name === 'AbortError') {
        throw StorefrontError('The store is taking too long to answer. Try again.');
      }
      throw StorefrontError('Could not reach the store. Check your internet and try again.');
    });
  }

  /* Capability flags: tokenless access covers products, collections and
   * search, but a few individual fields (tags, quantityRule) can require a
   * token depending on the shop's setup. Try them once; on a GraphQL error
   * retry lean and remember, so every later query succeeds first time. The
   * rules that use tags degrade gracefully - they mostly read the title and
   * description anyway. */
  function caps() { return readJson(local, CAPS_KEY, {}); }
  function setCap(name) {
    var c = caps(); c[name] = true; writeJson(local, CAPS_KEY, c);
  }

  /* ============================================================= CATALOGUE */

  var TILE_FIELDS =
    'id handle title vendor productType availableForSale publishedAt ' +
    'featuredImage { url } ' +
    'priceRange { minVariantPrice { amount } maxVariantPrice { amount } } ' +
    'compareAtPriceRange { maxVariantPrice { amount } }';

  var PAGE_SIZE = 24;

  /** Shopify sorts the aisle server-side, so PRICE and NEWEST arrive already
   *  in order without loading the whole listing first (the phone, reading
   *  the unsorted JSON feed, has to load the whole aisle; the API does not). */
  var SORT_KEYS = {
    featured: { key: 'COLLECTION_DEFAULT', reverse: false },
    newest: { key: 'CREATED', reverse: true },
    priceLow: { key: 'PRICE', reverse: false },
    priceHigh: { key: 'PRICE', reverse: true }
  };

  /* The whole catalogue is NOT read through the "all" collection handle.
   * On the storefront, /collections/all is a virtual collection Shopify
   * invents - which is what the app's JSON feed reads - but through the
   * Storefront API that handle resolves to whatever real collection the
   * merchant made with that name. On this store that answered with an empty
   * collection, and the shop's landing grid shipped blank (found in
   * production, 19 Sep 2026). The API's canonical whole-catalogue read is
   * the top-level products connection, which cannot be shadowed. */
  var CATALOG_SORT_KEYS = {
    featured: { key: 'BEST_SELLING', reverse: false },
    newest: { key: 'CREATED_AT', reverse: true },
    priceLow: { key: 'PRICE', reverse: false },
    priceHigh: { key: 'PRICE', reverse: true }
  };

  /** One page of everything the vendor lists under a brand, filtered
   *  server-side (products query: vendor:'...'), sorted like the
   *  catalogue. Falls back to a brand-filtered search page if the
   *  filtered read misbehaves, so a brand page degrades to fewer
   *  results, never to an error. */
  function brandPage(brand, opts) {
    opts = opts || {};
    var b = String(brand || '').trim();
    var sort = CATALOG_SORT_KEYS[opts.sort || 'featured'] || CATALOG_SORT_KEYS.featured;
    var query =
      'query RrtBrand($q: String!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {' +
      ' products(first: ' + PAGE_SIZE + ', after: $after, query: $q, sortKey: $sortKey, reverse: $reverse) {' +
      '  pageInfo { hasNextPage endCursor }' +
      '  nodes { ' + TILE_FIELDS + ' }' +
      ' }' +
      '}';
    var q = "vendor:'" + b.replace(/\\/g, '').replace(/'/g, "\\'") + "'";
    var cacheKey = 'brand|' + b + '|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gql(query, {
      q: q, after: opts.after || null, sortKey: sort.key, reverse: sort.reverse
    }, { cacheKey: cacheKey, fresh: opts.fresh }).then(function (data) {
      var conn = (data && data.products) || {};
      var info = conn.pageInfo || {};
      return {
        products: (conn.nodes || []).map(productFromGraphTile).filter(Boolean),
        hasMore: info.hasNextPage === true,
        endCursor: info.endCursor || null,
        missing: false,
        clientSort: false
      };
    }).catch(function () {
      if (opts.after) return { products: [], hasMore: false, endCursor: null, missing: false, clientSort: false };
      return searchAll(b).then(function (page) {
        var key = b.toLowerCase();
        return {
          products: page.products.filter(function (p) {
            return String(p.brand || '').trim().toLowerCase() === key;
          }),
          hasMore: false, endCursor: null, missing: false, clientSort: true
        };
      });
    });
  }

  /** A light look at a collection for hub cards: up to ten products via
   *  one feed call. Resolves null on any failure - previews decorate, they
   *  must never block or error a page. */
  function previewCollection(handle) {
    return feedGet('/collections/' + encodeURIComponent(handle) + '/products.json',
      { limit: '10', page: '1' })
      .then(function (body) {
        var raw = body && Array.isArray(body.products) ? body.products : [];
        return raw.map(productFromFeed).filter(Boolean);
      })
      .catch(function () { return null; });
  }

  /** The face of a card: the first in-stock product image and the best
   *  live discount among [tiles]. Nothing is claimed that is not true. */
  function previewFace(tiles) {
    if (!tiles || !tiles.length) return null;
    var image = null, maxOff = 0;
    for (var i = 0; i < tiles.length; i++) {
      var p = tiles[i];
      if (!image && p.available && p.imageUrl) image = p.imageUrl;
      var cv = p.cheapestVariant;
      var off = (p.available && cv && cv.compareAtPaise && cv.compareAtPaise > cv.pricePaise)
        ? Math.round(((cv.compareAtPaise - cv.pricePaise) * 100) / cv.compareAtPaise)
        : 0;
      if (off > maxOff) maxOff = off;
    }
    if (!image && tiles[0].imageUrl) image = tiles[0].imageUrl;
    return { image: image, maxOff: maxOff };
  }

  function catalogPage(opts) {
    opts = opts || {};
    var sort = CATALOG_SORT_KEYS[opts.sort || 'featured'] || CATALOG_SORT_KEYS.featured;
    var query =
      'query RrtCatalog($after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {' +
      ' products(first: ' + PAGE_SIZE + ', after: $after, sortKey: $sortKey, reverse: $reverse) {' +
      '  pageInfo { hasNextPage endCursor }' +
      '  nodes { ' + TILE_FIELDS + ' }' +
      ' }' +
      '}';
    var cacheKey = 'cat|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gql(query, {
      after: opts.after || null, sortKey: sort.key, reverse: sort.reverse
    }, { cacheKey: cacheKey, fresh: opts.fresh }).then(function (data) {
      var conn = (data && data.products) || {};
      var info = conn.pageInfo || {};
      return {
        products: (conn.nodes || []).map(productFromGraphTile).filter(Boolean),
        hasMore: info.hasNextPage === true,
        endCursor: info.endCursor || null,
        missing: false,
        clientSort: false
      };
    });
  }

  /** A listing straight from the vendor's feed - the app's own read.
   *  The catalogue pages 24 at a time (endCursor "fp:N"); an aisle is
   *  loaded whole (up to 1000 items) exactly as the app does when it
   *  sorts, so client-side sort is complete, not partial. */
  function feedCollectionPage(handle, opts) {
    opts = opts || {};
    var isCatalog = handle === Vendor.catalogHandle;
    var m = /^fp:(\d+)$/.exec(String(opts.after || ''));
    var pageNum = m ? parseInt(m[1], 10) : 1;

    function onePage(n, limit) {
      return feedGet('/collections/' + encodeURIComponent(handle) + '/products.json',
        { limit: String(limit), page: String(n) }, { fresh: opts.fresh })
        .then(function (body) {
          var raw = body && Array.isArray(body.products) ? body.products : [];
          return { raw: raw, products: raw.map(productFromFeed).filter(Boolean) };
        });
    }

    if (isCatalog) {
      return onePage(pageNum, PAGE_SIZE).then(function (r) {
        return {
          products: r.products,
          hasMore: r.raw.length >= PAGE_SIZE,
          endCursor: 'fp:' + (pageNum + 1),
          missing: false,
          clientSort: true
        };
      }).catch(feedMissing);
    }

    var all = [];
    function loop(n) {
      return onePage(n, 250).then(function (r) {
        all = all.concat(r.products);
        if (r.raw.length >= 250 && n < 4) return loop(n + 1);
        return { products: all, hasMore: false, endCursor: null, missing: false, clientSort: true };
      });
    }
    return loop(1).catch(feedMissing);
  }

  function feedMissing(e) {
    if (e && e.status === 404) {
      return { products: [], hasMore: false, endCursor: null, missing: true, clientSort: true };
    }
    throw e;
  }

  /** One page of a vendor collection. Resolves to
   *  { products, hasMore, endCursor, missing, clientSort } - missing true
   *  when the vendor has removed the collection. The Storefront API answers
   *  first (its sort is server-side); the vendor's own feeds - the app's
   *  endpoints, same-origin via the proxy - take over the moment the API
   *  errors or hands the catalogue back empty, and keep the session. */
  function collectionPage(handle, opts) {
    opts = opts || {};
    if (transport() === 'feeds' || /^fp:/.test(String(opts.after || ''))) {
      return feedCollectionPage(handle, opts);
    }
    var viaSf = handle === Vendor.catalogHandle
      ? catalogPage(opts)
      : sfCollectionPage(handle, opts);
    return viaSf.then(function (page) {
      if (!opts.after && !page.missing && !page.products.length) {
        // The API's answer contradicts the live store (their storefront
        // lists thousands of products). Trust the store, not the API.
        useFeeds();
        return feedCollectionPage(handle, opts);
      }
      return page;
    }).catch(function (e) {
      if (e && e.status === 404) throw e;
      useFeeds();
      return feedCollectionPage(handle, opts);
    });
  }

  function sfCollectionPage(handle, opts) {
    opts = opts || {};
    var sort = SORT_KEYS[opts.sort || 'featured'] || SORT_KEYS.featured;
    var query =
      'query RrtCollection($handle: String!, $after: String, $sortKey: ProductCollectionSortKeys, $reverse: Boolean) {' +
      ' collection(handle: $handle) {' +
      '  products(first: ' + PAGE_SIZE + ', after: $after, sortKey: $sortKey, reverse: $reverse) {' +
      '   pageInfo { hasNextPage endCursor }' +
      '   nodes { ' + TILE_FIELDS + ' }' +
      '  }' +
      ' }' +
      '}';
    var cacheKey = 'col|' + handle + '|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gql(query, {
      handle: handle, after: opts.after || null,
      sortKey: sort.key, reverse: sort.reverse
    }, { cacheKey: cacheKey, fresh: opts.fresh }).then(function (data) {
      var col = data && data.collection;
      if (!col) return { products: [], hasMore: false, endCursor: null, missing: true };
      var conn = col.products || {};
      var nodes = conn.nodes || [];
      var products = nodes.map(productFromGraphTile).filter(Boolean);
      var info = conn.pageInfo || {};
      return {
        products: products,
        hasMore: info.hasNextPage === true,
        endCursor: info.endCursor || null,
        missing: false,
        clientSort: false
      };
    });
  }

  function productQuery(lean) {
    return 'query RrtProduct($handle: String!) {' +
      ' product(handle: $handle) {' +
      '  id handle title vendor productType descriptionHtml publishedAt' +
      (lean ? '' : ' tags') +
      '  featuredImage { url }' +
      '  images(first: 20) { nodes { url } }' +
      '  options { name }' +
      '  variants(first: 100) { nodes {' +
      '   id title availableForSale' +
      '   price { amount } compareAtPrice { amount }' +
      '   image { url }' +
      '   selectedOptions { name value }' +
      (lean ? '' : '   quantityRule { maximum minimum increment }') +
      '  } }' +
      ' }' +
      '}';
  }

  /** The live product with every variant, from /products/{handle}.js  - 
   *  the exact read the app makes, quantity rules and tags included. Null
   *  when the vendor has removed it. `fresh` skips the cache - used when
   *  the answer decides money. The Storefront API is the fallback door. */
  function product(handle, opts) {
    opts = opts || {};
    return feedGet('/products/' + encodeURIComponent(handle) + '.js', null, { fresh: opts.fresh })
      .then(function (body) { return productFromAjax(body); })
      .catch(function (e) {
        if (e && e.status === 404) return null;
        return sfProduct(handle, opts);
      });
  }

  function sfProduct(handle, opts) {
    opts = opts || {};
    var lean = !!caps().leanProduct;
    var cacheKey = 'prod|' + handle;
    return gql(productQuery(lean), { handle: handle }, { cacheKey: cacheKey, fresh: opts.fresh })
      .catch(function (e) {
        // A field outside tokenless access answers with GraphQL errors, not
        // a transport failure: fall back to the lean query and remember.
        if (!lean && e && e.graphQLErrors) {
          setCap('leanProduct');
          cacheRemove(cacheKey);
          return gql(productQuery(true), { handle: handle }, { cacheKey: cacheKey, fresh: opts.fresh });
        }
        throw e;
      })
      .then(function (data) {
        var node = data && data.product;
        return node ? productFromGraphFull(node) : null;
      });
  }

  /* ================================================================ SEARCH */

  /** Search-as-you-type: the vendor's own suggest.json - the app's exact
   *  read - with matching products and matching collections (so "royal
   *  canin" offers their whole Royal Canin shelf, not just ten
   *  suggestions). The API's predictive search is the fallback. */
  function suggest(query) {
    var q = String(query || '').trim();
    if (q.length < 2) return Promise.resolve({ query: q, products: [], collections: [] });
    return feedGet('/search/suggest.json', {
      'q': q,
      'resources[type]': 'product,collection',
      'resources[limit]': '10',
      'resources[options][unavailable_products]': 'last'
    }).then(function (body) {
      var results = (body && body.resources && body.resources.results) || {};
      return {
        query: q,
        products: (results.products || []).map(productFromSuggest).filter(Boolean),
        collections: (results.collections || [])
          .map(function (c) {
            return { handle: String(c.handle || ''), title: decodeHtmlEntities(String(c.title || '')) };
          })
          .filter(function (c) { return c.handle && c.title; })
      };
    }).catch(function () { return sfSuggest(q); });
  }

  function sfSuggest(q) {
    var g =
      'query RrtSuggest($q: String!) {' +
      ' predictiveSearch(query: $q, limit: 10, limitScope: EACH,' +
      '  types: [PRODUCT, COLLECTION], unavailableProducts: LAST) {' +
      '  products { ' + TILE_FIELDS + ' }' +
      '  collections { handle title }' +
      ' }' +
      '}';
    return gql(g, { q: q }, { cacheKey: 'suggest|' + q }).then(function (data) {
      var ps = data && data.predictiveSearch;
      if (!ps) return { query: q, products: [], collections: [] };
      return {
        query: q,
        products: (ps.products || []).map(productFromGraphTile).filter(Boolean),
        collections: (ps.collections || [])
          .map(function (c) {
            return { handle: String(c.handle || ''), title: decodeHtmlEntities(String(c.title || '')) };
          })
          .filter(function (c) { return c.handle && c.title; })
      };
    }).catch(function () {
      // Suggestions are a convenience; the full search is the answer.
      return searchAll(q).then(function (page) {
        return { query: q, products: page.products.slice(0, 10), collections: [] };
      }).catch(function () {
        return { query: q, products: [], collections: [] };
      });
    });
  }

  /* The vendor's full search - every match, a page at a time. This query is
   * the one the app ships and has verified against the live shop. */
  var SEARCH_QUERY =
    'query RrtSearch($q: String!, $after: String) {\n' +
    '  search(query: $q, first: 24, after: $after, types: [PRODUCT], unavailableProducts: LAST) {\n' +
    '    totalCount\n' +
    '    pageInfo { hasNextPage endCursor }\n' +
    '    nodes {\n' +
    '      ... on Product {\n' +
    '        id\n        handle\n        title\n        vendor\n        productType\n        availableForSale\n' +
    '        publishedAt\n' +
    '        featuredImage { url }\n' +
    '        priceRange { minVariantPrice { amount } maxVariantPrice { amount } }\n' +
    '        compareAtPriceRange { maxVariantPrice { amount } }\n' +
    '      }\n    }\n  }\n}';

  function searchAll(query, opts) {
    opts = opts || {};
    var q = String(query || '').trim();
    if (!q) return Promise.resolve({ query: q, products: [], hasMore: false, endCursor: null, total: 0 });
    var cacheKey = 'search-all|' + q + '|' + (opts.after || '');
    return gql(SEARCH_QUERY, { q: q, after: opts.after || null }, { cacheKey: cacheKey })
      .then(function (data) {
        var search = data && data.search;
        if (!search) throw StorefrontError('Store search is not available right now.');
        var info = search.pageInfo || {};
        return {
          query: q,
          products: (search.nodes || []).map(productFromGraphTile).filter(Boolean),
          hasMore: info.hasNextPage === true,
          endCursor: info.endCursor || null,
          total: typeof search.totalCount === 'number' ? search.totalCount : null
        };
      })
      .catch(function (e) {
        if (opts.after) throw e; // deeper pages have no feed equivalent
        // Ten suggestions beat an error page.
        return suggest(q).then(function (r) {
          if (!r.products.length) throw e;
          return { query: q, products: r.products, hasMore: false, endCursor: null, total: null };
        });
      });
  }

  /** The vendor's related products, from their own recommendations feed  - 
   *  the app's read - with the API as fallback. Never rejects: a product
   *  page without recommendations is still a complete product page. */
  function recommendations(productId) {
    return feedGet('/recommendations/products.json', {
      product_id: String(productId), limit: '8', intent: 'related'
    }).then(function (body) {
      var raw = (body && Array.isArray(body.products)) ? body.products : [];
      return raw.map(productFromAjax).filter(Boolean)
        .filter(function (p) { return p.id !== productId; })
        .slice(0, 8);
    }).catch(function () { return sfRecommendations(productId); });
  }

  function sfRecommendations(productId) {
    var g =
      'query RrtRecs($id: ID!) {' +
      ' productRecommendations(productId: $id, intent: RELATED) { ' + TILE_FIELDS + ' }' +
      '}';
    return gql(g, { id: 'gid://shopify/Product/' + productId },
      { cacheKey: 'recs|' + productId })
      .then(function (data) {
        var list = (data && data.productRecommendations) || [];
        return list.map(productFromGraphTile).filter(Boolean)
          .filter(function (p) { return p.id !== productId; })
          .slice(0, 8);
      })
      .catch(function () { return []; });
  }

  /* ================================================================== CART */
  /* One cart, keyed by the vendor's variant id. Stores a snapshot so it
   * renders instantly and offline, but the snapshot is never trusted for
   * money: every line is re-read from the vendor on opening the cart and on
   * checkout, and the vendor's checkout is what charges. */

  function cartLines() {
    var raw = readJson(local, CART_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(lineFromJson).filter(Boolean);
  }

  function lineFromJson(m) {
    if (!m || typeof m !== 'object') return null;
    var variantId = paiseFromSubunits(m.variant_id);
    var qty = paiseFromSubunits(m.qty) || 0;
    var price = paiseFromSubunits(m.price);
    var handle = String(m.handle || '');
    if (variantId == null || variantId <= 0 || qty <= 0 || price == null || !handle) return null;
    return {
      variantId: variantId,
      productId: paiseFromSubunits(m.product_id) || 0,
      handle: handle,
      title: String(m.title || ''),
      variantTitle: String(m.variant_title || ''),
      pricePaise: price,
      compareAtPaise: paiseFromSubunits(m.compare_at),
      imageUrl: m.image || null,
      qty: qty,
      available: m.available !== false,
      maxQty: paiseFromSubunits(m.max_qty),
      previousPricePaise: null
    };
  }

  function lineToJson(l) {
    return {
      variant_id: l.variantId, product_id: l.productId, handle: l.handle,
      title: l.title, variant_title: l.variantTitle,
      price: l.pricePaise, compare_at: l.compareAtPaise, image: l.imageUrl,
      qty: l.qty, available: l.available, max_qty: l.maxQty
    };
  }

  /** What the stepper allows. The vendor's own quantity rule when they set
   *  one; otherwise their checkout is the judge of stock, not RRT. */
  function qtyCap(line) { return line.maxQty || 99; }

  function writeCart(lines) {
    writeJson(local, CART_KEY, lines.map(lineToJson));
    emit('rrt:cart', cartState(lines));
    return lines;
  }

  function cartState(lines) {
    lines = lines || cartLines();
    var count = 0, subtotal = 0;
    lines.forEach(function (l) {
      count += l.qty;
      if (l.available) subtotal += l.pricePaise * l.qty;
    });
    return { lines: lines, count: count, subtotalPaise: subtotal };
  }

  function cartAdd(p, variant, qty) {
    qty = qty || 1;
    var lines = cartLines();
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].variantId === variant.id) {
        lines[i].qty = Math.min(lines[i].qty + qty, qtyCap(lines[i]));
        return writeCart(lines);
      }
    }
    lines.push({
      variantId: variant.id,
      productId: p.id,
      handle: p.handle,
      title: p.title,
      variantTitle: variant.title.trim().toLowerCase() === 'default title' ? '' : variant.title,
      pricePaise: variant.pricePaise,
      compareAtPaise: variant.compareAtPaise || null,
      imageUrl: variant.imageUrl || p.imageUrl,
      qty: Math.min(qty, variant.maxQty || 99),
      available: variant.available,
      maxQty: variant.maxQty || null,
      previousPricePaise: null
    });
    return writeCart(lines);
  }

  function cartSetQty(variantId, qty) {
    var lines = cartLines();
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].variantId === variantId) {
        if (qty <= 0) lines.splice(i, 1);
        else lines[i].qty = Math.min(qty, qtyCap(lines[i]));
        break;
      }
    }
    return writeCart(lines);
  }

  function cartRemove(variantId) { return cartSetQty(variantId, 0); }
  function cartClear() { return writeCart([]); }

  /** Re-read every line from the vendor. FRESH - this decides money.
   *  Resolves to { lines, changes } where each change is
   *  { type: 'price'|'stock'|'gone', title, from, to }. */
  function cartRevalidate() {
    var lines = cartLines();
    if (!lines.length) return Promise.resolve({ lines: lines, changes: [] });

    var handles = [];
    lines.forEach(function (l) { if (handles.indexOf(l.handle) === -1) handles.push(l.handle); });

    return Promise.all(handles.map(function (h) {
      return product(h, { fresh: true }).catch(function (e) {
        // A line the vendor cannot answer for right now keeps its snapshot;
        // their checkout still gets the last word on it.
        return { __error: e };
      });
    })).then(function (results) {
      var byHandle = {};
      handles.forEach(function (h, i) { byHandle[h] = results[i]; });

      var changes = [];
      lines.forEach(function (l) {
        var res = byHandle[l.handle];
        if (res && res.__error) return;
        var label = l.title + (l.variantTitle ? ' \u00b7 ' + l.variantTitle : '');
        if (res === null) {
          if (l.available) changes.push({ type: 'gone', title: label });
          l.available = false;
          return;
        }
        var v = res.variantById(l.variantId);
        if (!v) {
          if (l.available) changes.push({ type: 'gone', title: label });
          l.available = false;
          return;
        }
        if (v.pricePaise !== l.pricePaise) {
          changes.push({ type: 'price', title: label, from: l.pricePaise, to: v.pricePaise });
          l.previousPricePaise = l.pricePaise;
          l.pricePaise = v.pricePaise;
        }
        if (l.available && !v.available) changes.push({ type: 'stock', title: label });
        l.available = v.available;
        l.compareAtPaise = v.compareAtPaise || null;
        l.title = res.title;
        l.imageUrl = v.imageUrl || res.imageUrl || l.imageUrl;
        l.maxQty = v.maxQty || null;
        if (l.qty > qtyCap(l)) l.qty = qtyCap(l);
      });
      writeCart(lines);
      return { lines: lines, changes: changes };
    });
  }

  /* ================================================================= SAVED */

  function saved() {
    var raw = readJson(local, SAVED_KEY, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(productFromSnapshot).filter(Boolean);
  }
  function isSaved(productId) {
    return readJson(local, SAVED_KEY, []).some(function (m) { return m && m.id === productId; });
  }
  function toggleSaved(p) {
    var raw = readJson(local, SAVED_KEY, []).filter(function (m) { return m && typeof m === 'object'; });
    var without = raw.filter(function (m) { return m.id !== p.id; });
    var nowSaved = without.length === raw.length;
    if (nowSaved) without.unshift(p.toSnapshot ? p.toSnapshot() : p);
    writeJson(local, SAVED_KEY, without.slice(0, 200));
    emit('rrt:saved', { count: without.length });
    return nowSaved;
  }

  /* ============================================================== RECEIPTS */
  /* What RRT keeps after a purchase: a receipt, not an order record. The
   * order is the vendor's. Up to 50, newest first. */

  function receipts() {
    var raw = readJson(local, RECEIPTS_KEY, []);
    return Array.isArray(raw) ? raw.filter(function (r) { return r && r.id; }) : [];
  }
  function receipt(id) {
    return receipts().filter(function (r) { return r.id === id; })[0] || null;
  }
  function saveReceipt(order) {
    var all = receipts().filter(function (r) { return r.id !== order.id; });
    all.unshift(order);
    writeJson(local, RECEIPTS_KEY, all.slice(0, 50));
    return order;
  }
  function dropReceipt(id) {
    writeJson(local, RECEIPTS_KEY, receipts().filter(function (r) { return r.id !== id; }));
  }

  function receiptDateLabel(createdAt) {
    var d = new Date(createdAt);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var now = new Date();
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) {
      return 'Today';
    }
    return d.getDate() + ' ' + months[d.getMonth()] +
      (d.getFullYear() === now.getFullYear() ? '' : ' ' + d.getFullYear());
  }

  /** Where VIEW ORDER STATUS goes: the vendor's order status page captured
   *  at checkout, or their account page (every order, any device). */
  function orderStatusUrl(order) {
    var raw = order && order.statusUrl;
    if (raw && /^https:\/\/[^/]+\//.test(raw)) return raw;
    return Vendor.accountUrl;
  }

  /* ============================================================== CHECKOUT */

  var RRT_REF_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  /** A new checkout reference, "RRT-7K2Q9XM4PA". One per checkout attempt;
   *  sent to the vendor as a cart attribute and matched by the backend's
   *  order ledger - the count the RRT Admin sees. */
  function newRrtRef() {
    var out = '';
    var n = RRT_REF_ALPHABET.length;
    var cryptoObj = global.crypto || global.msCrypto;
    if (cryptoObj && cryptoObj.getRandomValues) {
      var buf = new Uint32Array(10);
      cryptoObj.getRandomValues(buf);
      for (var i = 0; i < 10; i++) out += RRT_REF_ALPHABET[buf[i] % n];
    } else {
      for (var j = 0; j < 10; j++) out += RRT_REF_ALPHABET[Math.floor(Math.random() * n)];
    }
    return 'RRT-' + out;
  }

  /** The vendor's checkout with this cart pre-loaded (a Shopify cart
   *  permalink). Their checkout then does everything a checkout on their
   *  site does: address, delivery charge, offers, payment, confirmation.
   *
   *  `toVendorCart` lands on their cart page instead - the fallback if their
   *  checkout ever refuses a permalink, since from their cart page their own
   *  checkout button always works.
   *
   *  The `attributes[source]` note rides on the order in their admin - and
   *  onto the backend's ledger - so RRT can see which orders came through
   *  the website as opposed to the apps. */
  function checkoutUrl(lines, opts) {
    opts = opts || {};
    var items = lines
      .filter(function (l) { return l.qty > 0 && l.variantId > 0 && l.available; })
      .map(function (l) { return l.variantId + ':' + l.qty; })
      .join(',');
    var query = {};
    if (opts.toVendorCart) query.storefront = 'true';
    query['attributes[source]'] = 'RRT website';
    query.ref = 'rrt-web';
    if (opts.rrtRef) query['attributes[rrt_ref]'] = opts.rrtRef;
    var name = String(opts.buyerName || '').trim();
    if (!opts.toVendorCart && name) {
      // Documented prefill. Shopify's newer checkout may ignore it, in which
      // case the buyer types their name once on the vendor's page.
      var parts = name.split(/\s+/);
      query['checkout[shipping_address][first_name]'] = parts[0];
      if (parts.length > 1) query['checkout[shipping_address][last_name]'] = parts.slice(1).join(' ');
      query['checkout[shipping_address][country]'] = 'India';
    }
    var phone = String(opts.buyerPhone || '').replace(/[^0-9+]/g, '');
    if (!opts.toVendorCart && phone.length >= 10) {
      query['checkout[shipping_address][phone]'] = phone;
    }
    return Vendor.url('/cart/' + items, query);
  }

  /** Hand [lines] to the vendor's checkout, exactly as the app's
   *  startVendorCheckout does - mint a reference, keep a receipt, go.
   *
   *  The receipt records the hand-off itself: what was sent, when, and the
   *  reference that rode along. A browser cannot watch the vendor's
   *  checkout, so RRT never claims more than that - and never needs to,
   *  because the authoritative order count comes from the vendor's Shopify
   *  via the backend webhook, which sees the rrt_ref regardless. */
  function beginCheckout(lines, opts) {
    opts = opts || {};
    var sellable = lines.filter(function (l) { return l.available && l.variantId > 0 && l.qty > 0; });
    if (!sellable.length) return null;
    var rrtRef = newRrtRef();
    var now = Date.now();
    // The app's id is 'rrt-<millis>'. Two hand-offs in one millisecond would
    // share it and the second receipt would silently replace the first, so
    // bump until free. (Caught by the test suite, not by reasoning.)
    var id = 'rrt-' + now;
    for (var bump = 2; receipt(id); bump++) id = 'rrt-' + now + '-' + bump;
    var order = {
      id: id,
      lines: sellable.map(function (l) {
        return {
          variant_id: l.variantId, handle: l.handle, title: l.title,
          variant_title: l.variantTitle, qty: l.qty,
          unit_price: l.pricePaise, image: l.imageUrl
        };
      }),
      subtotalPaise: sellable.reduce(function (a, l) { return a + l.pricePaise * l.qty; }, 0),
      createdAt: now,
      vendorOrderNumber: null,
      statusUrl: null,
      rrtRef: rrtRef,
      status: 'handed'
    };
    saveReceipt(order);
    var permalink = checkoutUrl(sellable, {
      buyerName: opts.buyerName, buyerPhone: opts.buyerPhone, rrtRef: rrtRef
    });
    var mutation =
      'mutation RrtCartCreate($input: CartInput!) {' +
      ' cartCreate(input: $input) {' +
      '  cart { checkoutUrl }' +
      '  userErrors { message }' +
      ' }' +
      '}';
    var input = {
      lines: sellable.map(function (l) {
        return {
          merchandiseId: 'gid://shopify/ProductVariant/' + l.variantId,
          quantity: l.qty
        };
      }),
      attributes: [
        { key: 'source', value: 'RRT website' },
        { key: 'rrt_ref', value: rrtRef }
      ]
    };
    var attempt = gql(mutation, { input: input }, { fresh: true }).then(function (data) {
      var res = data && data.cartCreate;
      var cart = res && res.cart;
      if (cart && cart.checkoutUrl) return { order: order, url: cart.checkoutUrl, native: true };
      return { order: order, url: permalink, native: false };
    }).catch(function () {
      return { order: order, url: permalink, native: false };
    });
    // Never let a slow API hold the buyer: past the deadline, the permalink
    // goes out and the native attempt is simply abandoned.
    var deadline = new Promise(function (resolve) {
      setTimeout(function () {
        resolve({ order: order, url: permalink, native: false, timedOut: true });
      }, HANDOFF_DEADLINE_MS);
    });
    return Promise.race([attempt, deadline]);
  }


  /* ======================================================== DELETE MY DATA */

  /** Clears everything the shop keeps in this browser: cart, saved items,
   *  receipts, the legacy pending flag and the response cache - the same
   *  promise the app's delete-my-data makes. */
  function deleteMyData() {
    [CART_KEY, SAVED_KEY, RECEIPTS_KEY, 'rrt_store_pending_v1'].forEach(function (k) {
      try { local.removeItem(k); } catch (e) { /* ignore */ }
    });
    cacheClear();
    emit('rrt:cart', cartState([]));
  }

  /* ================================================================== MISC */

  function emit(name, detail) {
    try {
      global.dispatchEvent(new CustomEvent(name, { detail: detail }));
    } catch (e) { /* node, or very old browser */ }
  }

  function vegOnly() { return readJson(local, VEG_KEY, false) === true; }
  function setVegOnly(v) { writeJson(local, VEG_KEY, v === true); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* ============================================================ PUBLIC API */

  var api = {
    vendor: Vendor,
    shelves: SHELVES,
    shelfByKey: shelfByKey,
    shelfForAisle: shelfForAisle,
    money: formatPaise,
    paiseFromDecimal: paiseFromDecimal,
    paiseFromSubunits: paiseFromSubunits,
    imageUrl: absoluteImageUrl,
    sizedImage: sizedImageUrl,
    rules: Rules,
    decodeEntities: decodeHtmlEntities,
    descriptionBlocks: descriptionBlocks,
    sorts: SORTS,
    sortLabels: SORT_LABELS,
    visibleProducts: visibleProducts,
    collectionPage: collectionPage,
    previewCollection: previewCollection,
    previewFace: previewFace,
    brandPage: brandPage,
    product: product,
    sizeQuery: function (title) {
      var ps = parseSize(title);
      return ps ? ps.base : String(title || '');
    },
    sizeSiblings: sizeSiblings,
    suggest: suggest,
    searchAll: searchAll,
    recommendations: recommendations,
    cart: cartState,
    add: cartAdd,
    setQuantity: cartSetQty,
    remove: cartRemove,
    clearCart: cartClear,
    revalidateCart: cartRevalidate,
    qtyCap: qtyCap,
    saved: saved,
    isSaved: isSaved,
    toggleSaved: toggleSaved,
    receipts: receipts,
    receipt: receipt,
    receiptDateLabel: receiptDateLabel,
    orderStatusUrl: orderStatusUrl,
    newRrtRef: newRrtRef,
    checkoutUrl: checkoutUrl,
    beginCheckout: beginCheckout,
    deleteMyData: deleteMyData,
    vegOnly: vegOnly,
    setVegOnly: setVegOnly,
    esc: escapeHtml,
    clearResponseCache: cacheClear
  };
  /* END PUBLIC API */

  /* Test seams - used only by scripts/test-storefront-client.js. */
  api.__internal = {
    productFromGraphTile: productFromGraphTile,
    productFromGraphFull: productFromGraphFull,
    productFromSnapshot: productFromSnapshot,
    productFromFeed: productFromFeed,
    productFromAjax: productFromAjax,
    productFromSuggest: productFromSuggest,
    wrapProduct: wrapProduct,
    transport: transport,
    resetTransport: function () { try { session.removeItem(TRANSPORT_KEY); } catch (e) { /* ignore */ } },
    setHandoffDeadline: function (ms) { HANDOFF_DEADLINE_MS = ms; },
    setFetch: function (fn) { fetchImpl = fn; },
    stores: { local: local, session: session }
  };

  global.RRTShop = api;
})(typeof window !== 'undefined' ? window : globalThis);
