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

  /* The partner store is chosen by the BACKEND, not here. store_config.js
   * publishes app_config/store; rrt-store-config.js keeps the latest copy in
   * localStorage and reloads open shop pages when it changes. This file reads,
   * in order:
   *   1. global.RRT_SHOP_VENDOR       a test harness pinning a bundled vendor
   *   2. the published config         localStorage 'rrt_store_active_v1'
   *   3. the bundled registry         assets/rrt-store-vendors.js (generated
   *                                   from shared/store-vendors.json)
   * A published vendor is used only if it is well-formed and its proxy route
   * exists in vercel.json (KNOWN_PROXIES); otherwise the bundle's default is
   * used, so a bad publish can never take the shop down. */
  var BUNDLE = global.RRT_STORE_VENDORS || { defaultActive: null, vendors: {} };
  /* Each proxy route in vercel.json, the store it forwards to, and that
   * store's Storefront API hosts. A published vendor must name one of these
   * routes, that route's store as its domain and one of its API hosts, so a
   * bad or tampered publish can never point checkout, account or policy
   * links, or the Storefront API (listings, prices, carts), at another site. */
  var KNOWN_PROXIES = {
    '/st-api': { platform: 'shopify_public', domain: 'supertails.com', api: ['supertails.com'] },
    '/pl-api': { platform: 'shopify_public', domain: 'www.pets-lifestyle.com', api: ['www.pets-lifestyle.com', '08e8df.myshopify.com'] },
    '/huft-api': { platform: 'shopify_public', domain: 'headsupfortails.com', api: ['headsupfortails.com'] },
    '/zg-api': { platform: 'shopify_public', domain: 'zigly.com', api: ['zigly.com', 'zigly-store.myshopify.com'] },
    '/pt-api': { platform: 'shopify_headless', domain: 'pawsandtails24.com', api: ['pawsandtails24.com'] },
    '/jd-api': { platform: 'woocommerce', domain: 'www.justdogsstore.com', api: [] }
  };
  /* The three kinds of partner store, and the one checkout each uses:
   *   shopify_public    Shopify Online Store: feeds + Storefront API, cart permalink
   *   shopify_headless  Shopify behind a custom front end (Hydrogen): no feeds,
   *                     the Storefront API on its own site, checkout by cartCreate
   *   woocommerce       WordPress + WooCommerce: the public Store API, checkout on
   *                     the store's own cart page */
  var CHECKOUT_MODES = { shopify_public: 'cart_permalink', shopify_headless: 'storefront_cart', woocommerce: 'woo_cart' };
  var PUBLISHED_KEY = 'rrt_store_active_v1';

  /** A path on the store's own site ("/account"), never "//host" or "@host". */
  function sitePath(p) {
    return p == null || (typeof p === 'string' && /^\/(?!\/)[A-Za-z0-9._~\/-]{0,200}$/.test(p));
  }
  function usable(d) {
    if (!(d && typeof d.id === 'string' && Object.prototype.hasOwnProperty.call(CHECKOUT_MODES, d.platform) &&
      typeof d.domain === 'string' && d.web && typeof d.web.proxyBase === 'string' &&
      Object.prototype.hasOwnProperty.call(KNOWN_PROXIES, d.web.proxyBase))) return false;
    var known = KNOWN_PROXIES[d.web.proxyBase];
    // The route, the store and the KIND of store must all agree: a publish
    // cannot point a WooCommerce route at a Shopify reader, or the reverse.
    if (known.domain !== d.domain || known.platform !== d.platform) return false;
    if (d.platform === 'woocommerce') {
      if (!(d.woo && typeof d.woo.api === 'string' && /^\/wp-json\/wc\/store(?:\/v\d+)?$/.test(d.woo.api) &&
        sitePath(d.woo.productBase) && sitePath(d.woo.cart) && sitePath(d.woo.checkout) &&
        d.woo.productBase && d.woo.cart && d.woo.checkout)) return false;
    } else if (!(d.storefrontApi && typeof d.storefrontApi.host === 'string' &&
      known.api.indexOf(d.storefrontApi.host) !== -1 &&
      typeof d.storefrontApi.version === 'string' && /^\d{4}-\d{2}$/.test(d.storefrontApi.version) &&
      (d.shopId == null || /^\d{1,20}$/.test(String(d.shopId))))) {
      return false;
    }
    return !!(Array.isArray(d.shelves) && d.shelves.length &&
      d.support && d.policies && sitePath(d.policies.account) && sitePath(d.policies.refund) &&
      sitePath(d.policies.shipping) && d.checkout && d.checkout.mode === CHECKOUT_MODES[d.platform]);
  }
  function publishedDescriptor() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(PUBLISHED_KEY);
      var j = raw ? JSON.parse(raw) : null;
      return j && usable(j.active) ? j.active : null;
    } catch (e) { return null; }
  }
  var pinned = global.RRT_SHOP_VENDOR && BUNDLE.vendors[global.RRT_SHOP_VENDOR];
  var DESCRIPTOR = (pinned && usable(pinned) && pinned) || publishedDescriptor() ||
    BUNDLE.vendors[BUNDLE.defaultActive] || null;
  if (!DESCRIPTOR) throw new Error('rrt-shop: no partner store configured (load assets/rrt-store-vendors.js first)');
  var ACTIVE_VENDOR = DESCRIPTOR.id;
  var PLATFORM = DESCRIPTOR.platform || 'shopify_public';
  /** WordPress + WooCommerce: read through its Store API. */
  var IS_WOO = PLATFORM === 'woocommerce';
  /** Shopify with a custom front end: no storefront feeds exist. */
  var IS_HEADLESS = PLATFORM === 'shopify_headless';
  /** The store serves Shopify's JSON feeds (/collections/..json, /products/..js). */
  var HAS_FEEDS = PLATFORM === 'shopify_public';

  var Vendor = {
    key: DESCRIPTOR.id,
    platform: PLATFORM,
    isWoo: IS_WOO,
    isHeadless: IS_HEADLESS,
    displayName: DESCRIPTOR.displayName || DESCRIPTOR.id,
    domain: DESCRIPTOR.domain,
    /** Numeric Shopify shop id; order status pages live under /{shopId}/orders/. */
    shopId: DESCRIPTOR.shopId || null,
    /** Storefront API host (Shopify "tokenless access": no key to issue or leak). */
    myshopifyDomain: DESCRIPTOR.storefrontApi ? DESCRIPTOR.storefrontApi.host : null,
    storefrontApiVersion: DESCRIPTOR.storefrontApi ? DESCRIPTOR.storefrontApi.version : null,
    /** WooCommerce paths: Store API base, product pages, cart, checkout. */
    woo: DESCRIPTOR.woo || null,
    supportWhatsApp: DESCRIPTOR.support.whatsapp || null,
    supportPhone: DESCRIPTOR.support.phone || null,
    supportPhoneLabel: DESCRIPTOR.support.phoneLabel || null,
    supportEmail: DESCRIPTOR.support.email || null,
    accountPath: DESCRIPTOR.policies.account || '/account',
    refundPolicyPath: DESCRIPTOR.policies.refund || null,
    shippingPolicyPath: DESCRIPTOR.policies.shipping || null,
    catalogHandle: DESCRIPTOR.catalogHandle || 'all',
    proxyBase: DESCRIPTOR.web.proxyBase,
    brands: (DESCRIPTOR.brands || []).slice(),
    capabilities: DESCRIPTOR.capabilities || {},
    checkout: DESCRIPTOR.checkout
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
  /* A headless store's API sits on its own site, which sends no CORS headers,
   * so the browser reaches it same-origin through the Vercel route (as with
   * the feeds). A Shopify Online Store's API host is CORS-open: direct. */
  Vendor.storefrontApiUrl = IS_WOO ? null : IS_HEADLESS
    ? Vendor.proxyBase + '/api/' + Vendor.storefrontApiVersion + '/graphql.json'
    : 'https://' + Vendor.myshopifyDomain + '/api/' + Vendor.storefrontApiVersion + '/graphql.json';
  /* The vendor's storefront feeds, reached same-origin: Vercel rewrites
   * Vendor.proxyBase (/st-api or /pl-api) to the store, which is what lets a
   * browser read Shopify's JSON feeds (they send no CORS headers, so a
   * cross-origin fetch would be blocked; a same-origin path has no CORS). */
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
  Vendor.accountUrl = Vendor.url(Vendor.accountPath);
  Vendor.shippingPolicyUrl = Vendor.shippingPolicyPath ? Vendor.url(Vendor.shippingPolicyPath) : null;
  Vendor.refundPolicyUrl = Vendor.refundPolicyPath ? Vendor.url(Vendor.refundPolicyPath) : null;
  Vendor.productUrl = function (handle) {
    return IS_WOO ? Vendor.url(Vendor.woo.productBase + handle + '/') : Vendor.url('/products/' + handle);
  };
  Vendor.cartPageUrl = IS_WOO ? Vendor.url(Vendor.woo.cart) : Vendor.url('/cart');
  Vendor.whatsAppUrl = function (message) {
    if (!Vendor.supportWhatsApp) return null;
    return 'https://wa.me/' + Vendor.supportWhatsApp +
      (message ? '?text=' + encodeURIComponent(message) : '');
  };
  Vendor.phoneUrl = Vendor.supportPhone ? 'tel:' + Vendor.supportPhone : null;

  /* The ten shelves and their 71 aisle handles, verbatim from the app
   * (vendor.dart, verified 17 Sep 2026 against the vendor's own navigation).
   * The grouping and names are RRT's; the products inside each aisle are
   * whatever the vendor has in that collection right now. */
  /* Shelves and aisles come with the vendor descriptor: the grouping and
   * names are RRT's, the handles are the store's own collection handles.
   * Copied so a caller can never mutate the published config. */
  var SHELVES = JSON.parse(JSON.stringify(DESCRIPTOR.shelves)).map(function (s) {
    // The bundle writes an aisle as [label, handle]; a published store comes
    // from Firestore, which cannot hold a pair inside a list, as {label, handle}.
    s.aisles = s.aisles.map(function (a) {
      return Array.isArray(a) ? { label: a[0], handle: a[1] } : { label: a.label, handle: a.handle };
    });
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

  function plainHead(html, max) {
    var text = String(html || '').replace(/<[^>]*>/g, ' ');
    return text.length > max ? text.slice(0, max) : text;
  }

  /* ------------------------------------------------ VEGETARIAN (the switch)
   * What flags.store_veg_only reads. THE APP'S TWIN: StoreRules in
   * client/lib/core/models/store_models.dart does exactly this, with the same
   * words (shared/store-diet-rules.json, copied in below by
   * scripts/sync-shared.js) and the same real-listing test cases
   * (shared/store-diet-cases.json).
   *
   * A listing is read in this order; the first answer wins:
   *   1. the store's own diet tag says non-veg        ("Non-Veg", "Veg/Non-Veg:Non-Veg")
   *   2. the title names an animal ingredient          ("Chicken & Egg")
   *   3. the ingredient list names one                 ("Composition: dehydrated poultry protein")
   *   4. the store's own diet tag says veg             ("Veg", "Veg/Non-Veg:Veg")
   *   5. the type or another tag names one             ("Flavor:Chicken")
   *   6. the title, type or a tag says vegetarian      ("Vegetarian Dog Biscuits")
   *   7. the description names one anywhere
   *   8. an ingredient list is there and names none    -> vegetarian
   *   otherwise: not known.
   * "Chicken-free", "free from chicken, beef and fish" and "an alternative to
   * fish oil" are not animal ingredients. "Non-Veg" is never read as "Veg".
   *
   * With the switch on, food and treats stay only when they are known to be
   * vegetarian (a veg-only shop must not guess); medicines and supplements
   * go only when they name an animal ingredient; toys, beds, grooming and
   * other gear always stay. */
  /* rr:diet-rules GENERATED from shared/store-diet-rules.json by scripts/sync-shared.js - do not edit */
  var DIET_RULES = {"schemaVersion":1,"dietTagKeys":["veg\\s*/\\s*non[\\s-]*veg(?:etarian)?","diet(?:ary)?(?:\\s*(?:type|preference))?","food\\s*(?:preference|type)","preference","veg\\s*type"],"vegTagValues":["veg","vegetarian","vegan","pure\\s*veg","100\\s*%\\s*veg(?:etarian)?","plant[\\s-]*based"],"nonVegTagValues":["non[\\s-]*veg(?:etarian)?","contains\\s+meat","eggetarian"],"foodTagKeys":["food\\s*/\\s*non[\\s-]*food"],"foodTagValues":["food"],"nonFoodTagValues":["non[\\s-]*food"],"nonVegPhrases":["non[\\s-]*veg(?:etarian)?"],"vegWords":["veg","vegetarian","vegan","plant[\\s-]*based","meat[\\s-]*free","meatless","pure[\\s-]*veg","100\\s*%\\s*veg(?:etarian)?"],"animal":["meats?","meaty","non[\\s-]*veg(?:etarian)?","chickens?","hens?","poultry","turkey","ducks?","duckling","goose","geese","quail","pheasant","ostrich","emu","pigeon","fowl","beef","veal","mutton","lamb","sheep","goat(?!'?s?\\s*milk)","pork","ham","bacon","sausages?","salami","pepperoni","venison","deer","rabbit","hare","kangaroo","bison","buffalo(?!\\s*milk)","boar","elk","horse\\s*meat","camel(?!'?s?\\s*milk)","cow\\s+(?:ears?|hoof|hooves|hide|skin|tails?|trachea|bones?|lungs?|nose|snouts?)","pig(?:s)?\\s*(?:ears?|snouts?|trotters?|skin|tails?)","hoof","hooves","antlers?","trachea","gizzards?","giblets?","offal","tripe","marrow(?:\\s*bones?)?","liver(?!\\s+(?:support|care|health|tonic|function|protect\\w*|detox\\w*|disease|problems?|stimulant|formula))","bully\\s*sticks?","pizzle","rawhide","jerky\\s+strips?","fish(?:es)?","fishmeal","codfish","whitefish","salmon","tuna","sardines?","mackerel","anchov(?:y|ies)","herring","pollock","cod(?=\\s+(?:liver|fish|oil|fillets?))","haddock","trout","tilapia","catfish","basa","hilsa","rohu","pomfret","bonito","skipjack","katsuobushi","menhaden","capelin","sprats?","whitebait","shark","krill","prawns?","shrimps?","crabs?","lobsters?","squid","octopus","cuttlefish","shellfish","seafood","mussels?","oysters?","clams?","scallops?","eels?","roe","caviar","eggs?","yolks?","albumen","egg\\s*shell(?:\\s*membrane)?","gelatine?","collagen","chondroitin","lard","tallow","suet","isinglass","carmine","cochineal","animal\\s+(?:fats?|proteins?|digests?|derivatives?|by[\\s-]*products?|origin|tissues?|liver|meal)","of\\s+animal\\s+origin","insect\\s+(?:protein|meal|flour|larvae|oil)","black\\s+soldier\\s+fly","crickets?","mealworms?","blood\\s+(?:meal|plasma)","dried\\s+blood","plasma\\s+protein","bone\\s+(?:meal|broth)"],"negationCues":["no","not","never","nor","zero","0\\s*%","without","free\\s+(?:from|of)","excludes?","excluding","avoids?","avoiding","instead\\s+of","alternative\\s+to","replaces?","allerg(?:y|ic|ies)\\s+to","sensitive\\s+to","intoleran(?:t|ce)\\s+to"],"negationAfter":["free","less"],"positiveCues":["with","contains?","containing","made","real","including","includes?","rich","plus","added","fresh","and\\s+real","enriched","fortified","source"],"clauseBreaks":["but","however","while","whereas"],"ingredientHeadings":["ingredients?","composition","key\\s+ingredients","made\\s+with","what'?s\\s+inside","contents?","formulation"],"sectionStops":["guaranteed\\s+analysis","analytical\\s+constituents","nutritional\\s+(?:information|value|analysis|additives)","nutrition\\s+facts","typical\\s+analysis","feeding","benefits?","key\\s+benefits","features","key\\s+features","how\\s+to","directions?","storage","dosage","usage","additives","why\\s+(?:choose|buy|feed|use|this|our|it|we)","about\\s+(?:the|this|our|brand|product)","product\\s+details","specifications?","note","caution","disclaimer"],"flavourWords":["flavou?r(?:ed|s)?","scented","infused","coated","basted"],"gearPhrases":["(?:food|treats?|water|kibble|snack)[\\s-]+(?:bowls?|feeders?|dispens\\w*|containers?|storage|mats?|scoops?|pouch(?:es)?|bags?|holders?|stands?|toys?|balls?|puzzles?|jars?|bins?|trays?)"],"strongFoodWords":["foods?","treats?","biscuits?","cookies?","kibble","gravy","jerky","snacks?","pate","puree","broth","meals?","bites","diets?","rawhide","bully","pizzle","dentastix","stews?","chunks","morsels","lickables?","churu"],"weakFoodWords":["chews?","chewy","dental\\s+sticks?","sticks?","bones?","wet","dry","milk\\s+replacer","puppy\\s+milk","kitten\\s+milk","seeds?","pellets?","flakes","feed"],"ingestibleWords":["tablets?","tabs","chewables?","capsules?","syrups?","oral\\s+(?:suspension|solution|liquid|gel|paste)","dewormers?"],"healthWords":["supplements?","tablets?","tabs","syrups?","capsules?","tonic","dewormers?","deworming","medicines?","medication","probiotics?","prebiotics?","vitamins?","multivitamins?","drops","oral","suspension","powder","gel","paste","ointment","cream","antibiotics?","pharmacy","health","wellness","chewables?","liquid","solution","injection"],"nonFoodWords":["toys?","plush","squeak\\w*","balls?","ropes?","frisbees?","tug","collars?","leash(?:es)?","harness(?:es)?","beds?","mats?","bowls?","feeders?","fountains?","crates?","carriers?","brush(?:es)?","combs?","shampoos?","conditioners?","sprays?","wipes","litter","scoopers?","scratchers?","cages?","aquariums?","tanks?","filters?","clothes","t[\\s-]*shirts?","jackets?","sweaters?","hoodies?","raincoats?","shoes","socks","booties","muzzles?","clippers?","trimmers?","nail\\s+cutters?","diapers?","pads","poop","bags?","tents?","houses?","towels?","perfumes?","deodori[sz]ers?","colognes?","grooming","gloves?","bandanas?","spot[\\s-]*on","tick","ticks","flea","fleas","lice","cleaners?","toothbrush(?:es)?","tags?","kits?","stands?","cushions?","blankets?","leads?","gates?","cameras?","trackers?"]};
  /* /rr:diet-rules */

  var Diet = (function (R) {
    function alt(list) { return '(?:' + (list || []).join('|') + ')'; }
    /* Whole words; a trailing lookahead instead of \b so "0%" ends a word. */
    function words(list, flags) { return new RegExp('\\b' + alt(list) + '(?![a-z0-9_])', flags || 'i'); }
    function whole(list) { return new RegExp('^' + alt(list) + '$', 'i'); }
    function keyed(list) { return new RegExp('^' + alt(list) + '\\s*[:=]\\s*(.+)$', 'i'); }
    var RE = {
      dietKey: keyed(R.dietTagKeys),
      vegVal: whole(R.vegTagValues),
      nonVegVal: whole(R.nonVegTagValues),
      foodKey: keyed(R.foodTagKeys),
      foodVal: whole(R.foodTagValues),
      nonFoodVal: whole(R.nonFoodTagValues),
      nonVegPhrase: words(R.nonVegPhrases, 'gi'),
      vegWord: words(R.vegWords),
      animal: words(R.animal, 'gi'),
      negCue: words(R.negationCues, 'gi'),
      negAfter: new RegExp('^\\s*-?\\s*' + alt(R.negationAfter) + '(?![a-z0-9_])', 'i'),
      positive: words(R.positiveCues),
      clauseBreak: new RegExp('[.;:!?\\n\\u2022|()\\[\\]]|\\b' + alt(R.clauseBreaks) + '(?![a-z0-9_])', 'gi'),
      ingHead: new RegExp('\\b' + alt(R.ingredientHeadings) + '(?![a-z0-9_])[ \\t]*(?::|-|\\n)', 'gi'),
      stop: words(R.sectionStops),
      strongFood: words(R.strongFoodWords),
      weakFood: words(R.weakFoodWords),
      ingestible: words(R.ingestibleWords),
      health: words(R.healthWords),
      nonFood: words(R.nonFoodWords),
      /* "Food bowl", "treat pouch": gear, whatever the first word says. */
      gear: words(R.gearPhrases, 'gi'),
      /* "Chicken Flavoured Dental Chew Toy": an animal flavour makes gear
       * something that is eaten after all. */
      flavoured: new RegExp('\\b' + alt(R.animal) + '[\\s-]*' + alt(R.flavourWords) + '(?![a-z0-9_])', 'i')
    };

    var ENTITIES = { '&amp;': '&', '&nbsp;': ' ', '&#160;': ' ', '&#39;': "'", '&apos;': "'",
      '&rsquo;': "'", '&lsquo;': "'", '&quot;': '"', '&ldquo;': '"', '&rdquo;': '"', '&lt;': '<', '&gt;': '>' };

    /** The listing's words: block tags become line breaks (a heading or a
     *  list item ends a clause), every other tag goes. */
    function plainText(html, max) {
      var s = String(html || '')
        .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\s*\/?\s*(?:br|p|li|ul|ol|div|tr|td|th|h[1-6]|section|table)\b[^>]*>/gi, '\n')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&(?:amp|nbsp|#160|#39|apos|rsquo|lsquo|quot|ldquo|rdquo|lt|gt);/gi, function (e) { return ENTITIES[e.toLowerCase()] || ' '; })
        .replace(/[ \t\r\f\v ]+/g, ' ');
      return s.length > max ? s.slice(0, max) : s;
    }

    function normTag(t) { return String(t || '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim(); }

    /** Is the animal word at [at] negated: "chicken-free", "no chicken",
     *  "free from chicken, beef and fish", "an alternative to fish oil"?
     *  Only within its clause, and not across a word like "with" or "real"
     *  ("no added sugar, with real chicken" names chicken). */
    function negated(text, at, len) {
      if (RE.negAfter.test(text.slice(at + len, at + len + 12))) return true;
      var before = text.slice(Math.max(0, at - 80), at);
      var start = 0, b;
      RE.clauseBreak.lastIndex = 0;
      while ((b = RE.clauseBreak.exec(before)) !== null) {
        start = b.index + b[0].length;
        if (!b[0].length) RE.clauseBreak.lastIndex++;
      }
      var clause = before.slice(start);
      var cue = null, c;
      RE.negCue.lastIndex = 0;
      while ((c = RE.negCue.exec(clause)) !== null) {
        cue = c;
        if (!c[0].length) RE.negCue.lastIndex++;
      }
      if (!cue) return false;
      var between = clause.slice(cue.index + cue[0].length);
      if (RE.positive.test(between)) return false;
      return between.split(/\s+/).filter(Boolean).length <= 8;
    }

    /** The first animal ingredient [text] names (not negated), or null. */
    function animalIn(text) {
      if (!text) return null;
      var m;
      RE.animal.lastIndex = 0;
      while ((m = RE.animal.exec(text)) !== null) {
        if (!m[0].length) { RE.animal.lastIndex++; continue; }
        if (!negated(text, m.index, m[0].length)) return m[0].toLowerCase().replace(/\s+/g, ' ');
      }
      return null;
    }

    function saysVeg(text) {
      return RE.vegWord.test(String(text || '').replace(RE.nonVegPhrase, ' '));
    }

    /** The ingredient lists in a description ("Ingredients: a, b, c"),
     *  joined; '' when there is none. A list, not a sentence that happens to
     *  say "ingredients": at least three short items. */
    function ingredientsIn(text) {
      var out = [], m;
      RE.ingHead.lastIndex = 0;
      while ((m = RE.ingHead.exec(text)) !== null) {
        var rest = text.slice(m.index + m[0].length, m.index + m[0].length + 900);
        var stop = RE.stop.exec(rest);
        if (stop && stop.index > 0) rest = rest.slice(0, stop.index);
        var items = rest.split(/[,\n•;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
        var short = items.filter(function (x) { return x.split(/\s+/).length <= 6; });
        if (items.length >= 3 && short.length >= Math.ceil(items.length * 0.7)) out.push(rest);
      }
      return out.join('\n');
    }

    /** food | health | nonfood | other, from the store's own
     *  "Food/non-food" tag when it has one, else the title and type. */
    function categoryOf(title, type, struct) {
      var t = title + ' \n ' + type;
      var fed = t.replace(RE.gear, ' ');
      if (struct === 'nonfood') return 'nonfood';
      if (RE.ingestible.test(t)) return 'health';
      if (RE.flavoured.test(title)) return 'food';
      if (struct !== 'food' && RE.nonFood.test(t) && !RE.strongFood.test(fed)) return 'nonfood';
      if (RE.strongFood.test(fed)) return 'food';
      if (RE.health.test(t)) return 'health';
      if (struct === 'food' || RE.weakFood.test(t)) return 'food';
      return 'other';
    }

    function result(diet, category, source, term) {
      return { diet: diet, category: category, source: source, term: term || null };
    }

    /** { diet: veg | non_veg | unknown, category, source, term }. */
    function classify(p) {
      var title = String(p.title || ''), type = String(p.productType || '');
      var vendor = null, struct = null, other = [];
      (p.tags || []).forEach(function (raw) {
        var t = normTag(raw);
        if (!t) return;
        var k = RE.dietKey.exec(t);
        var v = k ? k[1].trim() : t;
        if (RE.nonVegVal.test(v)) { vendor = 'non_veg'; return; }
        if (RE.vegVal.test(v)) { if (vendor !== 'non_veg') vendor = 'veg'; return; }
        if (k) return;
        var f = RE.foodKey.exec(t);
        if (f) {
          var fv = f[1].trim();
          if (RE.nonFoodVal.test(fv)) struct = 'nonfood';
          else if (RE.foodVal.test(fv) && struct !== 'nonfood') struct = 'food';
          return;
        }
        other.push(t);
      });
      var category = categoryOf(title, type, struct);
      var desc = plainText(p.descriptionHtml, 20000);
      var ing = ingredientsIn(desc);
      var tagText = other.join(' \n ');
      var hit;
      if (vendor === 'non_veg') return result('non_veg', category, 'store_tag', null);
      if ((hit = animalIn(title))) return result('non_veg', category, 'title', hit);
      if ((hit = animalIn(ing))) return result('non_veg', category, 'ingredients', hit);
      if (vendor === 'veg') return result('veg', category, 'store_tag', null);
      if ((hit = animalIn(type + ' \n ' + tagText))) return result('non_veg', category, 'tags', hit);
      if (saysVeg(title + ' \n ' + type + ' \n ' + tagText)) return result('veg', category, 'label', null);
      if ((hit = animalIn(desc))) return result('non_veg', category, 'description', hit);
      if (ing) return result('veg', category, 'ingredients', null);
      return result('unknown', category, null, null);
    }

    /** Hidden while veg-only is on. */
    function hidden(d) {
      if (d.category === 'nonfood') return false;
      if (d.diet === 'non_veg') return true;
      if (d.diet === 'veg') return false;
      return d.category === 'food';
    }

    return { classify: classify, hidden: hidden, animalIn: animalIn, plainText: plainText };
  })(DIET_RULES);

  /** The product's diet, worked out once per product object. */
  function dietOf(p) {
    if (!p) return Diet.classify({});
    if (!p._diet) {
      try { Object.defineProperty(p, '_diet', { value: Diet.classify(p), enumerable: false, writable: true }); }
      catch (e) { return Diet.classify(p); }
    }
    return p._diet;
  }

  var Rules = {
    isRx: function (p) {
      return RE_RX.test(p.tags.join(' ') + ' ' + p.productType + ' ' + plainHead(p.descriptionHtml, 6000));
    },
    /** The VEG label: known vegetarian, and something eaten. */
    isVeg: function (p) {
      var d = dietOf(p);
      return d.diet === 'veg' && d.category !== 'nonfood';
    },
    diet: dietOf,
    /** Used only when the veg-only flag is on (see above). */
    hideWhenVegOnly: function (p) { return Diet.hidden(dietOf(p)); },
    /** Why a product is not in the vegetarian shop, in plain words, for the
     *  product page. Null when it is. */
    vegOnlyReason: function (p) {
      var d = dietOf(p);
      if (!Diet.hidden(d)) return null;
      if (d.diet === 'non_veg') {
        if (d.source === 'store_tag') return 'The store lists it as non-vegetarian.';
        return 'Its listing names ' + (d.term || 'an animal ingredient') + '.';
      }
      return 'Its listing does not show that it is vegetarian.';
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
      tags: Array.isArray(node.tags) ? node.tags.map(String) : [],
      // The plain-text start of the description (asked for while veg-only is
      // on), escaped so it is safe anywhere HTML is expected.
      descriptionHtml: typeof node.description === 'string' ? escapeText(node.description) : '',
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

  function escapeText(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
      descriptionHtml: typeof m.body === 'string' ? m.body : '',
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

  /* A bag or saved list built against one store holds that store's product
   * and variant ids, which mean nothing to another store. When the active
   * store changes, both start fresh (receipts stay: they point at the store
   * that took the order). Same for this tab's cached feeds and transport. */
  var VENDOR_KEY = 'rrt_store_vendor';
  (function () {
    var was = null;
    try { was = local.getItem(VENDOR_KEY); } catch (e) { /* private mode */ }
    if (was === ACTIVE_VENDOR) return;
    if (was !== null || readJson(local, CART_KEY, null) || readJson(local, SAVED_KEY, null)) {
      try { local.removeItem(CART_KEY); local.removeItem(SAVED_KEY); } catch (e) { /* ignore */ }
      try {
        var doomed = [];
        for (var i = 0; i < session.length; i++) { var k = session.key(i); if (k && k.indexOf('rrt_sf_') === 0) doomed.push(k); }
        doomed.forEach(function (k) { session.removeItem(k); });
      } catch (e) { /* ignore */ }
    }
    try { local.setItem(VENDOR_KEY, ACTIVE_VENDOR); } catch (e) { /* ignore */ }
  })();

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

  var TILE_BASE =
    'id handle title vendor productType availableForSale publishedAt ' +
    'featuredImage { url } ' +
    'priceRange { minVariantPrice { amount } maxVariantPrice { amount } } ' +
    'compareAtPriceRange { maxVariantPrice { amount } }';

  /* What a listing tile carries besides price and picture: the store's tags
   * (the VEG label and the veg-only switch read them first; Supertails marks
   * every listing "Veg" or "Non-Veg"), and while veg-only is on the start of
   * the description too, for stores whose tags say nothing about diet. A
   * store that refuses tags without a token gets the lean tile, remembered
   * like leanProduct. The cache key carries the shape, so a tile read
   * without the description is never reused once veg-only turns on. */
  var DIET_TEXT_CHARS = 6000;
  /* Remembered per store, so switching partner store starts afresh. */
  function leanTiles() { return !!caps()['leanTiles:' + Vendor.key]; }
  function tileFields() {
    return TILE_BASE + (leanTiles() ? '' : ' tags') +
      (vegOnly() ? ' description(truncateAt: ' + DIET_TEXT_CHARS + ')' : '');
  }
  function tileKey(key) {
    return key ? key + '|' + (leanTiles() ? 'l' : 't') + (vegOnly() ? 'd' : '') : null;
  }
  /** gql() for a query of tiles: [build] makes the query from the tile
   *  fields. A GraphQL error on the full tile retries lean, once. */
  function gqlTiles(build, variables, opts) {
    opts = opts || {};
    function run() {
      return gql(build(tileFields()), variables, { cacheKey: tileKey(opts.cacheKey), fresh: opts.fresh });
    }
    return run().catch(function (e) {
      if (e && e.graphQLErrors && !leanTiles()) {
        setCap('leanTiles:' + Vendor.key);
        return run();
      }
      throw e;
    });
  }

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
    if (IS_WOO) return wooBrandPage(brand, opts);
    var b = String(brand || '').trim();
    var sort = CATALOG_SORT_KEYS[opts.sort || 'featured'] || CATALOG_SORT_KEYS.featured;
    var query = function (F) { return (
      'query RrtBrand($q: String!, $after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {' +
      ' products(first: ' + PAGE_SIZE + ', after: $after, query: $q, sortKey: $sortKey, reverse: $reverse) {' +
      '  pageInfo { hasNextPage endCursor }' +
      '  nodes { ' + F + ' }' +
      ' }' +
      '}'); };
    var q = "vendor:'" + b.replace(/\\/g, '').replace(/'/g, "\\'") + "'";
    var cacheKey = 'brand|' + b + '|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gqlTiles(query, {
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
    if (IS_WOO) {
      return wooCollectionPage(handle, { limit: 10 })
        .then(function (page) { return page.missing ? null : page.products; })
        .catch(function () { return null; });
    }
    if (!HAS_FEEDS) {
      return sfCollectionPage(handle, {})
        .then(function (page) { return page.missing ? null : page.products.slice(0, 10); })
        .catch(function () { return null; });
    }
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
    var query = function (F) { return (
      'query RrtCatalog($after: String, $sortKey: ProductSortKeys, $reverse: Boolean) {' +
      ' products(first: ' + PAGE_SIZE + ', after: $after, sortKey: $sortKey, reverse: $reverse) {' +
      '  pageInfo { hasNextPage endCursor }' +
      '  nodes { ' + F + ' }' +
      ' }' +
      '}'); };
    var cacheKey = 'cat|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gqlTiles(query, {
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
    if (IS_WOO) return wooCollectionPage(handle, opts);
    if (!HAS_FEEDS) {
      // A headless store has no feeds to fall back to: the API is the store.
      return handle === Vendor.catalogHandle ? catalogPage(opts) : sfCollectionPage(handle, opts);
    }
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
    var query = function (F) { return (
      'query RrtCollection($handle: String!, $after: String, $sortKey: ProductCollectionSortKeys, $reverse: Boolean) {' +
      ' collection(handle: $handle) {' +
      '  products(first: ' + PAGE_SIZE + ', after: $after, sortKey: $sortKey, reverse: $reverse) {' +
      '   pageInfo { hasNextPage endCursor }' +
      '   nodes { ' + F + ' }' +
      '  }' +
      ' }' +
      '}'); };
    var cacheKey = 'col|' + handle + '|' + (opts.sort || 'featured') + '|' + (opts.after || '');
    return gqlTiles(query, {
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
    if (IS_WOO) return wooProduct(handle, opts);
    if (!HAS_FEEDS) return sfProduct(handle, opts);
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
    if (IS_WOO) return wooSuggest(q);
    if (!HAS_FEEDS) return sfSuggest(q);
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
    var g = function (F) { return (
      'query RrtSuggest($q: String!) {' +
      ' predictiveSearch(query: $q, limit: 10, limitScope: EACH,' +
      '  types: [PRODUCT, COLLECTION], unavailableProducts: LAST) {' +
      '  products { ' + F + ' }' +
      '  collections { handle title }' +
      ' }' +
      '}'); };
    return gqlTiles(g, { q: q }, { cacheKey: 'suggest|' + q }).then(function (data) {
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
  function SEARCH_QUERY(F) {
    return 'query RrtSearch($q: String!, $after: String) {\n' +
      '  search(query: $q, first: 24, after: $after, types: [PRODUCT], unavailableProducts: LAST) {\n' +
      '    totalCount\n' +
      '    pageInfo { hasNextPage endCursor }\n' +
      '    nodes {\n' +
      '      ... on Product { ' + F + ' }\n' +
      '    }\n  }\n}';
  }

  function searchAll(query, opts) {
    opts = opts || {};
    var q = String(query || '').trim();
    if (!q) return Promise.resolve({ query: q, products: [], hasMore: false, endCursor: null, total: 0 });
    if (IS_WOO) return wooSearch(q, opts);
    var cacheKey = 'search-all|' + q + '|' + (opts.after || '');
    return gqlTiles(SEARCH_QUERY, { q: q, after: opts.after || null }, { cacheKey: cacheKey })
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
    if (IS_WOO) return wooRelated(productId);
    if (!HAS_FEEDS) return sfRecommendations(productId);
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
    var g = function (F) { return (
      'query RrtRecs($id: ID!) {' +
      ' productRecommendations(productId: $id, intent: RELATED) { ' + F + ' }' +
      '}'); };
    return gqlTiles(g, { id: 'gid://shopify/Product/' + productId },
      { cacheKey: 'recs|' + productId })
      .then(function (data) {
        var list = (data && data.productRecommendations) || [];
        return list.map(productFromGraphTile).filter(Boolean)
          .filter(function (p) { return p.id !== productId; })
          .slice(0, 8);
      })
      .catch(function () { return []; });
  }

  /* =========================================================== WOOCOMMERCE */
  /* A WordPress + WooCommerce store, read through WooCommerce's public Store
   * API (/wp-json/wc/store/v1) - the same API their own block cart and
   * checkout use. The browser reaches it same-origin through the Vercel
   * route (Vendor.proxyBase), which forwards only the read-only product and
   * category endpoints.
   *
   * Every answer is turned into the one product shape the pages already
   * read, so nothing above this layer knows which kind of store it is:
   *   prices      minor units with currency_minor_unit (JustDogs: 0, so
   *               "3400" is ₹3,400) -> integer paise
   *   variations  the product lists its variation ids and their attribute
   *               slugs; prices and stock come from ?parent=ID&type=variation
   *   collections product categories, by slug (children included)
   *   brand       the "Brand" attribute (pa_brand), else Woo's own brands
   *   tags        tags, categories and "Attribute: value" pairs, which the
   *               VEG label and the veg-only switch read like Shopify tags */

  var WOO_SORT = {
    featured: { orderby: 'menu_order', order: 'asc' },
    newest: { orderby: 'date', order: 'desc' },
    priceLow: { orderby: 'price', order: 'asc' },
    priceHigh: { orderby: 'price', order: 'desc' }
  };

  function wooGet(path, query, opts) {
    return feedGet(Vendor.woo.api + path, query, opts);
  }

  /** "3400" with currency_minor_unit 0 -> 340000 paise. Integer maths only. */
  function wooMoney(prices, key) {
    if (!prices || prices[key] == null || String(prices[key]).trim() === '') return null;
    var raw = String(prices[key]).trim();
    if (!/^-?\d+$/.test(raw)) return null;
    var n = parseInt(raw, 10);
    var minor = typeof prices.currency_minor_unit === 'number' ? prices.currency_minor_unit : 2;
    if (minor === 2) return n;
    if (minor < 2) return n * Math.pow(10, 2 - minor);
    return Math.round(n / Math.pow(10, minor - 2));
  }

  function wooText(t) { return decodeHtmlEntities(String(t || '').replace(/<[^>]*>/g, '')).trim(); }

  function wooBrand(m) {
    var attrs = Array.isArray(m.attributes) ? m.attributes : [];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      if (a && (a.taxonomy === 'pa_brand' || /^brands?$/i.test(String(a.name || ''))) && a.terms && a.terms[0]) {
        return wooText(a.terms[0].name);
      }
    }
    if (Array.isArray(m.brands) && m.brands[0] && m.brands[0].name) return wooText(m.brands[0].name);
    return '';
  }

  /** The most specific shop category (not a brand, breed or life stage):
   *  what Shopify would call the product type. */
  function wooType(m) {
    var best = null, depth = -1;
    (Array.isArray(m.categories) ? m.categories : []).forEach(function (c) {
      var link = String(c && c.link || '');
      if (/\/(brands|[a-z-]*breeds?|[a-z-]*life-stage)\//i.test(link)) return;
      var d = link.split('/').filter(Boolean).length;
      if (d > depth) { depth = d; best = c; }
    });
    return best ? wooText(best.name) : '';
  }

  function wooTags(m) {
    var out = [];
    (Array.isArray(m.tags) ? m.tags : []).forEach(function (t) { if (t && t.name) out.push(wooText(t.name)); });
    (Array.isArray(m.categories) ? m.categories : []).forEach(function (c) { if (c && c.name) out.push(wooText(c.name)); });
    (Array.isArray(m.attributes) ? m.attributes : []).forEach(function (a) {
      if (!a || !a.name || a.has_variations) return;
      (a.terms || []).forEach(function (t) { if (t && t.name) out.push(wooText(a.name) + ': ' + wooText(t.name)); });
    });
    return out;
  }

  function wooMaxQty(atc) {
    var max = atc && typeof atc.maximum === 'number' ? atc.maximum : null;
    return (max != null && max > 0 && max < 99) ? max : null;
  }

  function wooImages(m, tile) {
    return (Array.isArray(m.images) ? m.images : []).map(function (i) {
      return absoluteImageUrl(i && (tile ? (i.thumbnail || i.src) : (i.src || i.thumbnail)));
    }).filter(Boolean);
  }

  /** Where WooCommerce's own "add to cart" link for a variation points,
   *  as the query it carries (attribute_pa_size=small, variation_id, ...). */
  function wooAddQuery(atc) {
    var url = atc && atc.url ? decodeHtmlEntities(String(atc.url)).replace(/&#0?38;/g, '&') : '';
    var q = url.indexOf('?') === -1 ? '' : url.slice(url.indexOf('?') + 1);
    var out = {};
    q.split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i <= 0) return;
      var k = decodeURIComponent(kv.slice(0, i));
      if (/^attribute_[a-z0-9_-]+$/i.test(k)) out[k] = decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' '));
    });
    return out;
  }

  function wooBase(m, extra) {
    var p = {
      id: m.id,
      handle: String(m.slug || ''),
      title: wooText(m.name),
      brand: wooBrand(m),
      productType: wooType(m),
      tags: wooTags(m),
      descriptionHtml: String(m.description || m.short_description || ''),
      createdAtMs: null,
      platformData: { type: m.type }
    };
    Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return wrapProduct(p);
  }

  /** A grid tile from a Store API product. A simple product is complete
   *  (its one variant is the product); a variable one carries its price
   *  range until the product page loads the variations. */
  function productFromWoo(m) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'number' || !m.slug) return null;
    var price = wooMoney(m.prices, 'price');
    if (price == null) return null;
    var available = m.is_in_stock !== false && m.is_purchasable !== false;
    var images = wooImages(m, true);
    if (m.type === 'variable' || (Array.isArray(m.variations) && m.variations.length)) {
      var range = m.prices && m.prices.price_range;
      var min = range ? wooMoney({ v: range.min_amount, currency_minor_unit: m.prices.currency_minor_unit }, 'v') : price;
      var max = range ? wooMoney({ v: range.max_amount, currency_minor_unit: m.prices.currency_minor_unit }, 'v') : null;
      return wooBase(m, {
        images: images, options: [],
        variants: previewVariants(min == null ? price : min, max, wooMoney(m.prices, 'regular_price'), available),
        partial: true
      });
    }
    return wooBase(m, {
      images: images, options: [],
      variants: [{
        id: m.id, title: 'Default Title', optionValues: [],
        pricePaise: price,
        compareAtPaise: realCompareAt(wooMoney(m.prices, 'regular_price'), price),
        available: available, imageUrl: null,
        maxQty: wooMaxQty(m.add_to_cart),
        wooAdd: { product: m.id, variation: null, attrs: {} }
      }],
      partial: false
    });
  }

  /** The full product: the parent's record plus its variations. */
  function productFromWooFull(m, variationRecords) {
    if (!m || typeof m !== 'object' || typeof m.id !== 'number' || !m.slug) return null;
    var images = wooImages(m, false);
    if (m.type !== 'variable' && !(Array.isArray(m.variations) && m.variations.length)) {
      var simple = productFromWoo(m);
      if (!simple) return null;
      simple.images = images.length ? images : simple.images;
      simple.imageUrl = simple.images[0] || null;
      return simple;
    }
    var optionAttrs = (Array.isArray(m.attributes) ? m.attributes : []).filter(function (a) { return a && a.has_variations; });
    var listed = {};
    (Array.isArray(m.variations) ? m.variations : []).forEach(function (v) { if (v && v.id) listed[v.id] = v.attributes || []; });
    var variants = (variationRecords || []).map(function (v) {
      var price = wooMoney(v.prices, 'price');
      if (typeof v.id !== 'number' || price == null) return null;
      var own = listed[v.id] || [];
      var values = optionAttrs.map(function (a) {
        var slug = null;
        own.forEach(function (x) { if (x && x.name === a.name) slug = x.value; });
        var term = null;
        (a.terms || []).forEach(function (t) { if (t && t.slug === slug) term = t; });
        return term ? wooText(term.name) : (slug ? String(slug) : 'Any');
      });
      var img = Array.isArray(v.images) && v.images[0] ? absoluteImageUrl(v.images[0].src) : null;
      return {
        id: v.id,
        title: values.length ? values.join(' / ') : wooText(v.variation || 'Default Title'),
        optionValues: values,
        pricePaise: price,
        compareAtPaise: realCompareAt(wooMoney(v.prices, 'regular_price'), price),
        available: v.is_in_stock !== false && v.is_purchasable !== false,
        imageUrl: img,
        maxQty: wooMaxQty(v.add_to_cart),
        wooAdd: { product: m.id, variation: v.id, attrs: wooAddQuery(v.add_to_cart) }
      };
    }).filter(Boolean);
    if (!variants.length) return null;
    // The vendor's own order of choices (Small before Medium), not the API's.
    var order = {};
    (Array.isArray(m.variations) ? m.variations : []).forEach(function (v, i) { if (v) order[v.id] = i; });
    variants.sort(function (a, b) { return (order[a.id] || 0) - (order[b.id] || 0); });
    return wooBase(m, {
      images: images,
      options: optionAttrs.map(function (a) {
        return { name: wooText(a.name), values: (a.terms || []).map(function (t) { return wooText(t.name); }) };
      }),
      variants: variants,
      partial: false
    });
  }

  function wooPageNum(after) {
    var m = /^wp:(\d+)$/.exec(String(after || ''));
    return m ? parseInt(m[1], 10) : 1;
  }

  /** One page of a category ("aisle") or, for the catalogue handle, of the
   *  whole store, sorted by WooCommerce. Same shape as collectionPage. */
  function wooCollectionPage(handle, opts) {
    opts = opts || {};
    var n = wooPageNum(opts.after);
    var size = opts.limit || PAGE_SIZE;
    var sort = WOO_SORT[opts.sort || 'featured'] || WOO_SORT.featured;
    var q = { per_page: String(size), page: String(n), orderby: sort.orderby, order: sort.order };
    if (handle !== Vendor.catalogHandle) q.category = handle;
    else if (!opts.sort || opts.sort === 'featured') { q.orderby = 'popularity'; q.order = 'desc'; }
    return wooGet('/products', q, { fresh: opts.fresh }).then(function (body) {
      var raw = Array.isArray(body) ? body : [];
      return {
        products: raw.map(productFromWoo).filter(Boolean),
        hasMore: raw.length >= size,
        endCursor: 'wp:' + (n + 1),
        missing: false,
        clientSort: false
      };
    }).catch(function (e) {
      if (e && (e.status === 404 || e.status === 400)) {
        return { products: [], hasMore: false, endCursor: null, missing: true, clientSort: false };
      }
      throw e;
    });
  }

  /** The live product with every variation. Null when the store has
   *  removed it. [fresh] skips the cache: used when the answer decides money. */
  function wooProduct(handle, opts) {
    opts = opts || {};
    return wooGet('/products', { slug: handle }, { fresh: opts.fresh }).then(function (body) {
      var m = Array.isArray(body) ? body[0] : null;
      if (!m) return null;
      var variable = m.type === 'variable' || (Array.isArray(m.variations) && m.variations.length);
      if (!variable) return productFromWooFull(m, []);
      return wooGet('/products', { parent: String(m.id), type: 'variation', per_page: '100' }, { fresh: opts.fresh })
        .then(function (vs) {
          var p = productFromWooFull(m, Array.isArray(vs) ? vs : []);
          if (!p) throw StorefrontError('The store could not load this right now.');
          return p;
        });
    }).catch(function (e) {
      if (e && e.status === 404) return null;
      throw e;
    });
  }

  /** Every product category (slug, name, count), read once per tab. */
  var wooCatsPromise = null;
  function wooCategories() {
    if (wooCatsPromise) return wooCatsPromise;
    var hit = cacheGet('woo-cats');
    if (hit !== undefined) { wooCatsPromise = Promise.resolve(hit); return wooCatsPromise; }
    var all = [];
    function page(n) {
      return fetchJson(Vendor.feedUrl(Vendor.woo.api + '/products/categories', { per_page: '100', page: String(n) }),
        { headers: { 'Accept': 'application/json' } }).then(function (body) {
        var list = Array.isArray(body) ? body : [];
        list.forEach(function (c) {
          if (c && c.slug && c.name) all.push({ slug: String(c.slug), name: wooText(c.name), count: typeof c.count === 'number' ? c.count : 0 });
        });
        if (list.length >= 100 && n < 10) return page(n + 1);
        return all;
      });
    }
    wooCatsPromise = page(1).then(function (list) { cacheSet('woo-cats', list); return list; })
      .catch(function () { wooCatsPromise = null; return []; });
    return wooCatsPromise;
  }

  /** Search as you type: ten products, plus the store's categories whose
   *  names start with the words typed ("royal" offers Royal Canin). */
  function wooSuggest(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return Promise.all([
      wooGet('/products', { search: q, per_page: '10' }).catch(function () { return []; }),
      wooCategories()
    ]).then(function (r) {
      var products = (Array.isArray(r[0]) ? r[0] : []).map(productFromWoo).filter(Boolean);
      var collections = r[1].filter(function (c) {
        if (!c.count) return false;
        var name = ' ' + c.name.toLowerCase();
        return words.every(function (w) { return name.indexOf(' ' + w) !== -1; });
      }).sort(function (a, b) { return b.count - a.count; }).slice(0, 5)
        .map(function (c) { return { handle: c.slug, title: c.name }; });
      return { query: q, products: products, collections: collections };
    });
  }

  function wooSearch(q, opts) {
    opts = opts || {};
    var n = wooPageNum(opts.after);
    return wooGet('/products', { search: q, per_page: String(PAGE_SIZE), page: String(n) }).then(function (body) {
      var raw = Array.isArray(body) ? body : [];
      return {
        query: q,
        products: raw.map(productFromWoo).filter(Boolean),
        hasMore: raw.length >= PAGE_SIZE,
        endCursor: 'wp:' + (n + 1),
        total: null
      };
    });
  }

  /** WooCommerce's own related products. Never rejects. */
  function wooRelated(productId) {
    return wooGet('/products', { related: String(productId), per_page: '8' }).then(function (body) {
      return (Array.isArray(body) ? body : []).map(productFromWoo).filter(Boolean)
        .filter(function (p) { return p.id !== productId; }).slice(0, 8);
    }).catch(function () { return []; });
  }

  function slugify(t) {
    return String(t || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /** A brand is a category on a WooCommerce store (Brands > Royal Canin).
   *  If it is not one, the store's search filtered to that brand. */
  function wooBrandPage(brand, opts) {
    var b = String(brand || '').trim();
    return wooCollectionPage(slugify(b), opts).then(function (page) {
      if (!page.missing && (page.products.length || opts.after)) return page;
      return wooSearch(b, {}).then(function (r) {
        var key = b.toLowerCase();
        return {
          products: r.products.filter(function (p) { return String(p.brand || '').trim().toLowerCase() === key; }),
          hasMore: false, endCursor: null, missing: false, clientSort: true
        };
      });
    });
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
  /* ================================================== DELIVERY QUOTE */
  /* Shopify's own delivery charge for THIS cart at THIS address, before the
   * buyer sees a payment screen. A cart is created on the vendor's Shopify
   * with the saved address; Shopify answers with the delivery options it
   * would offer at checkout and what each costs. The one the buyer sees is
   * pinned on that cart, and checkout is handed off ON THAT SAME CART - so
   * the vendor's page shows the same delivery charge and the same total by
   * construction. If the API cannot be reached, the shop says so plainly
   * and hands off by permalink instead (delivery then shows on their page). */

  /** Shopify's province codes for India, keyed by the names in INDIA_STATES. */
  var STATE_CODES = {
    'Andaman and Nicobar Islands': 'AN', 'Andhra Pradesh': 'AP', 'Arunachal Pradesh': 'AR',
    'Assam': 'AS', 'Bihar': 'BR', 'Chandigarh': 'CH', 'Chhattisgarh': 'CG',
    'Dadra and Nagar Haveli': 'DN', 'Daman and Diu': 'DD', 'Delhi': 'DL', 'Goa': 'GA',
    'Gujarat': 'GJ', 'Haryana': 'HR', 'Himachal Pradesh': 'HP', 'Jammu and Kashmir': 'JK',
    'Jharkhand': 'JH', 'Karnataka': 'KA', 'Kerala': 'KL', 'Ladakh': 'LA', 'Lakshadweep': 'LD',
    'Madhya Pradesh': 'MP', 'Maharashtra': 'MH', 'Manipur': 'MN', 'Meghalaya': 'ML',
    'Mizoram': 'MZ', 'Nagaland': 'NL', 'Odisha': 'OR', 'Puducherry': 'PY', 'Punjab': 'PB',
    'Rajasthan': 'RJ', 'Sikkim': 'SK', 'Tamil Nadu': 'TN', 'Telangana': 'TS', 'Tripura': 'TR',
    'Uttar Pradesh': 'UP', 'Uttarakhand': 'UK', 'West Bengal': 'WB'
  };

  var CART_FIELDS =
    ' id checkoutUrl' +
    ' cost { subtotalAmount { amount } totalAmount { amount } totalTaxAmount { amount } }' +
    ' deliveryGroups(first: 5) { nodes { id' +
    '   deliveryOptions { handle title deliveryMethodType estimatedCost { amount } }' +
    '   selectedDeliveryOption { handle estimatedCost { amount } }' +
    ' } }';

  var QUOTE_TTL_MS = 3 * 60 * 1000;
  var quoteCache = {};

  function sellableOf(lines) {
    return (lines || []).filter(function (l) { return l.available && l.variantId > 0 && l.qty > 0; });
  }

  function quoteKey(lines, d) {
    var items = sellableOf(lines).map(function (l) { return l.variantId + ':' + l.qty; }).sort().join(',');
    return items + '|' + [d.address1, d.address2, d.city, d.state, d.pin, d.phone, d.email].join('|');
  }

  /** Parse a Shopify cart into a quote. Null when the cart carries no
   *  delivery options yet (the address may need a moment to resolve). */
  function quoteFromCart(cart, rrtRef, key) {
    if (!cart || !cart.id || !cart.checkoutUrl) return null;
    var groups = (cart.deliveryGroups && cart.deliveryGroups.nodes) || [];
    var options = [];
    var deliveryPaise = 0;
    var selected = null;
    var allSelected = groups.length > 0;
    groups.forEach(function (g, gi) {
      (g.deliveryOptions || []).forEach(function (o) {
        var paise = paiseFromDecimal(o.estimatedCost && o.estimatedCost.amount);
        if (paise == null) return;
        options.push({ groupId: g.id, handle: o.handle, title: o.title || 'Delivery', paise: paise, method: o.deliveryMethodType || '' });
      });
      var sel = g.selectedDeliveryOption;
      if (sel && sel.handle) {
        var sp = paiseFromDecimal(sel.estimatedCost && sel.estimatedCost.amount);
        deliveryPaise += sp || 0;
        if (gi === 0) selected = { groupId: g.id, handle: sel.handle, paise: sp || 0 };
      } else {
        allSelected = false;
      }
    });
    if (!options.length) return null;
    var total = paiseFromDecimal(cart.cost && cart.cost.totalAmount && cart.cost.totalAmount.amount);
    var listed = paiseFromDecimal(cart.cost && cart.cost.subtotalAmount && cart.cost.subtotalAmount.amount);
    var tax = paiseFromDecimal(cart.cost && cart.cost.totalTaxAmount && cart.cost.totalTaxAmount.amount) || 0;
    if (total == null) return null;
    if (listed == null) listed = total;
    // Shopify's cart totalAmount is what the buyer pays and, once a delivery
    // option is selected, already INCLUDES that delivery charge. Proven on a
    // live order (items 1,534.15 + delivery 65 = totalAmount 1,599.15);
    // adding delivery again once showed a total 65 too high. The one case
    // where it is exclusive is when nothing is selected yet - detected as
    // totalAmount equalling the listed subtotal with a delivery charge
    // outstanding - and then we add it ourselves.
    var deliveryInTotal = allSelected && !(total === listed && deliveryPaise > 0);
    var payable = allSelected ? (deliveryInTotal ? total : total + deliveryPaise) : null;
    var items = allSelected ? payable - deliveryPaise : total;   // items, offers applied
    if (items < 0) items = total;
    return {
      key: key,
      at: Date.now(),
      cartId: cart.id,
      checkoutUrl: cart.checkoutUrl,
      rrtRef: rrtRef,
      itemsPaise: items,
      listedPaise: listed,
      offersPaise: listed > items ? listed - items : 0,
      taxPaise: tax,
      options: groups.length === 1 ? options : [],   // a chooser only makes sense for one group
      selected: selected,
      deliveryPaise: allSelected ? deliveryPaise : null,
      totalPaise: payable,
      groupsPendingSelection: !allSelected
    };
  }

  function cartInput(lines, d, rrtRef) {
    return {
      lines: sellableOf(lines).map(function (l) {
        return { merchandiseId: 'gid://shopify/ProductVariant/' + l.variantId, quantity: l.qty };
      }),
      attributes: [
        { key: 'source', value: 'RRT website' },
        { key: 'rrt_ref', value: rrtRef }
      ],
      buyerIdentity: { email: d.email, phone: '+91' + d.phone, countryCode: 'IN' },
      delivery: {
        addresses: [{
          selected: true,
          oneTimeUse: false,
          address: {
            deliveryAddress: {
              firstName: d.firstName, lastName: d.lastName,
              address1: d.address1, address2: d.address2 || null,
              city: d.city, provinceCode: STATE_CODES[d.state] || null,
              zip: d.pin, countryCode: 'IN', phone: '+91' + d.phone
            }
          }
        }]
      }
    };
  }

  function userErrorMessage(errs) {
    var e = (errs || [])[0];
    return e && e.message ? e.message : null;
  }

  /** Shopify's delivery options and charge for [lines] shipped to [d].
   *  Resolves to a quote (see quoteFromCart). Rejects with a StorefrontError
   *  whose message can be shown: an unserviceable address says so; a network
   *  failure says the store could not be reached. Cached for three minutes
   *  per cart+address, so a re-render never re-creates a cart. */
  function quoteDelivery(lines, d, opts) {
    opts = opts || {};
    if (!Vendor.capabilities.deliveryQuote || IS_WOO) {
      return Promise.reject(StorefrontError('This store shows its delivery charge on its own checkout page.'));
    }
    if (!d || !validateDelivery(d).ok) return Promise.reject(StorefrontError('Delivery details are needed first.'));
    if (!sellableOf(lines).length) return Promise.reject(StorefrontError('Nothing in the bag can be delivered.'));
    var key = quoteKey(lines, d);
    var hit = quoteCache[key];
    if (hit && !opts.fresh && Date.now() - hit.at < QUOTE_TTL_MS) return Promise.resolve(hit);
    var rrtRef = newRrtRef();
    var mutation =
      'mutation RrtCartQuote($input: CartInput!) {' +
      ' cartCreate(input: $input) { cart {' + CART_FIELDS + ' } userErrors { message field } }' +
      '}';
    return gql(mutation, { input: cartInput(lines, d, rrtRef) }, { fresh: true }).then(function (data) {
      var res = data && data.cartCreate;
      var msg = userErrorMessage(res && res.userErrors);
      if (msg) throw StorefrontError(msg);
      var cart = res && res.cart;
      var q = quoteFromCart(cart, rrtRef, key);
      if (q) return q;
      if (!cart || !cart.id) throw StorefrontError('The store could not price delivery right now.');
      // Delivery options can lag the cart by a moment; read the cart once more.
      var read = 'query RrtCartRead($id: ID!) { cart(id: $id) {' + CART_FIELDS + ' } }';
      return new Promise(function (resolve) { setTimeout(resolve, 700); }).then(function () {
        return gql(read, { id: cart.id }, { fresh: true });
      }).then(function (d2) {
        var q2 = quoteFromCart(d2 && d2.cart, rrtRef, key);
        if (!q2) throw StorefrontError('The store does not deliver to this address.');
        return q2;
      });
    }).then(function (q) {
      // Every group must have a selected option, or the total is not final.
      if (q.groupsPendingSelection && q.options.length) {
        var cheapest = q.options.slice().sort(function (a, b) { return a.paise - b.paise; })[0];
        return selectDeliveryOption(q, cheapest.handle);
      }
      quoteCache[key] = q;
      return q;
    });
  }

  /** Pin a delivery option on the quoted cart. Resolves to the refreshed
   *  quote; the checkout hand-off then shows exactly this option. */
  function selectDeliveryOption(quote, handle) {
    var opt = null;
    (quote.options || []).forEach(function (o) { if (o.handle === handle) opt = o; });
    if (!opt) return Promise.reject(StorefrontError('That delivery option is not available.'));
    var mutation =
      'mutation RrtCartSelect($cartId: ID!, $sel: [CartSelectedDeliveryOptionInput!]!) {' +
      ' cartSelectedDeliveryOptionsUpdate(cartId: $cartId, selectedDeliveryOptions: $sel) {' +
      '  cart {' + CART_FIELDS + ' } userErrors { message field } } }';
    return gql(mutation, { cartId: quote.cartId, sel: [{ deliveryGroupId: opt.groupId, deliveryOptionHandle: handle }] }, { fresh: true })
      .then(function (data) {
        var res = data && data.cartSelectedDeliveryOptionsUpdate;
        var msg = userErrorMessage(res && res.userErrors);
        if (msg) throw StorefrontError(msg);
        var q = quoteFromCart(res && res.cart, quote.rrtRef, quote.key);
        if (!q) throw StorefrontError('The store could not price delivery right now.');
        quoteCache[quote.key] = q;
        return q;
      });
  }

  function quoteMatches(quote, lines, d) {
    return !!quote && !!d && quote.key === quoteKey(lines, d) && Date.now() - quote.at < QUOTE_TTL_MS;
  }

  /* ================================================= DELIVERY DETAILS */
  /* What the vendor's checkout asks for, collected once here so the buyer
   * only presses Pay there. Kept ON THIS DEVICE only (localStorage): RRT's
   * servers never see it, nothing logs it, and it travels exactly once - to
   * the vendor, inside the HTTPS checkout link, which is Shopify's own
   * documented cart-permalink mechanism. Delete-my-data wipes it.
   *
   * The same rules live in the app (lib/core/models/delivery_details.dart)
   * so a detail that validates on one client validates on the other. */

  var DELIVERY_KEY = 'rrt_store_delivery_v1';

  /** The vendor's checkout lists these under State for India. */
  var INDIA_STATES = [
    'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam',
    'Bihar', 'Chandigarh', 'Chhattisgarh', 'Dadra and Nagar Haveli', 'Daman and Diu',
    'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
    'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
    'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
    'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'
  ];


  /** One clean string: trimmed, control characters and newlines removed,
   *  length capped. Nothing that could break a URL or a form reaches the
   *  vendor. */
  function cleanText(v, max) {
    return String(v == null ? '' : v)
      .replace(/[\u0000-\u001f\u007f]/g, ' ') // eslint-disable-line no-control-regex -- strip control characters on purpose
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /** Indian mobile as ten digits, from any of "+91 81052 50299",
   *  "081052-50299", "8105250299". Empty when it is not one. */
  function tenDigitPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return d.length === 10 ? d : '';
  }

  /** Normalise raw input into the stored shape. */
  function normalizeDelivery(raw) {
    raw = raw || {};
    return {
      firstName: cleanText(raw.firstName, 50),
      lastName: cleanText(raw.lastName, 50),
      email: cleanText(raw.email, 254).toLowerCase(),
      phone: tenDigitPhone(raw.phone) || cleanText(raw.phone, 20),
      address1: cleanText(raw.address1, 120),
      address2: cleanText(raw.address2, 120),
      city: cleanText(raw.city, 60),
      state: cleanText(raw.state, 60),
      pin: String(raw.pin == null ? '' : raw.pin).replace(/\D/g, '').slice(0, 6)
    };
  }

  /** Validate a normalised delivery record. Returns { ok, errors } where
   *  errors maps field -> human message. Messages are the copy the form
   *  shows; the app carries the same set. */
  function validateDelivery(d) {
    var e = {};
    if (!d.firstName) e.firstName = 'First name is needed.';
    if (!d.lastName) e.lastName = 'Last name is needed. The seller\u2019s checkout requires it.';
    if (!d.email) e.email = 'Email is needed for the order confirmation.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'That email does not look right.';
    if (!/^[6-9]\d{9}$/.test(d.phone)) e.phone = 'A 10-digit Indian mobile number is needed.';
    if (!d.address1) e.address1 = 'Address is needed.';
    else if (d.address1.length < 4) e.address1 = 'That address is too short.';
    if (!d.city) e.city = 'City is needed.';
    if (!d.state) e.state = 'Pick a state.';
    else if (INDIA_STATES.indexOf(d.state) === -1) e.state = 'Pick a state from the list.';
    if (!/^[1-9]\d{5}$/.test(d.pin)) e.pin = 'A 6-digit PIN code is needed.';
    return { ok: Object.keys(e).length === 0, errors: e };
  }

  /** The saved delivery record, or null. */
  function delivery() {
    var raw = readJson(local, DELIVERY_KEY, null);
    return raw && typeof raw === 'object' ? normalizeDelivery(raw) : null;
  }

  /** Whether a complete, valid record is saved: the condition for a
   *  press-Pay-only checkout. */
  function deliveryComplete() {
    var d = delivery();
    return !!d && validateDelivery(d).ok;
  }

  /** Validate and save. Returns { ok, errors, details }. Nothing is saved
   *  when invalid, so a saved record is always a complete one. */
  function saveDelivery(raw) {
    var d = normalizeDelivery(raw);
    var v = validateDelivery(d);
    if (v.ok) writeJson(local, DELIVERY_KEY, d);
    return { ok: v.ok, errors: v.errors, details: d };
  }

  function clearDelivery() {
    try { local.removeItem(DELIVERY_KEY); } catch (err) { /* ignore */ }
  }

  /** The documented Shopify cart-permalink prefill keys, from a delivery
   *  record. Only complete, valid records are mapped: a partial one would
   *  prefill half a form, which is worse than an empty one. */
  function deliveryQuery(d) {
    if (!d || !validateDelivery(d).ok) return {};
    var q = {};
    q['checkout[email]'] = d.email;
    q['checkout[shipping_address][first_name]'] = d.firstName;
    q['checkout[shipping_address][last_name]'] = d.lastName;
    q['checkout[shipping_address][address1]'] = d.address1;
    if (d.address2) q['checkout[shipping_address][address2]'] = d.address2;
    q['checkout[shipping_address][city]'] = d.city;
    q['checkout[shipping_address][province]'] = d.state;
    q['checkout[shipping_address][zip]'] = d.pin;
    q['checkout[shipping_address][country]'] = 'India';
    q['checkout[shipping_address][phone]'] = '+91' + d.phone;
    return q;
  }

  /** An https link on the store's own site (its domain, with or without
   *  www, or its Storefront API host): nowhere else is a buyer sent to pay. */
  function trustedCheckoutUrl(u) {
    var m = /^https:\/\/([^\/?#:@\s]+)(?:[\/?#]|$)/i.exec(typeof u === 'string' ? u : '');
    if (!m) return false;
    var host = m[1].toLowerCase();
    var bare = Vendor.domain.replace(/^www\./, '');
    if (host === Vendor.domain || host === bare || host === Vendor.myshopifyDomain) return true;
    // Their own subdomains (www., checkout.): still their site.
    if (host.length > bare.length + 1 && host.slice(-(bare.length + 1)) === '.' + bare) return true;
    // A headless store's checkout runs on Shopify's own host for the shop;
    // the link comes from that store's API, through the route fixed in
    // vercel.json, so it is theirs.
    return IS_HEADLESS && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(host);
  }

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
    // Full prefill from saved delivery details, so the vendor's checkout
    // opens ready to pay. Falls back to name + phone only, then to nothing:
    // a missing detail never blocks a sale, the buyer just types it there.
    var d = opts.delivery === undefined ? delivery() : opts.delivery;
    var full = (!opts.toVendorCart && d) ? deliveryQuery(d) : {};
    if (Object.keys(full).length) {
      Object.keys(full).forEach(function (k) { query[k] = full[k]; });
    } else {
      var name = String(opts.buyerName || '').trim();
      if (!opts.toVendorCart && name) {
        var parts = name.split(/\s+/);
        query['checkout[shipping_address][first_name]'] = parts[0];
        if (parts.length > 1) query['checkout[shipping_address][last_name]'] = parts.slice(1).join(' ');
        query['checkout[shipping_address][country]'] = 'India';
      }
      var phone = String(opts.buyerPhone || '').replace(/[^0-9+]/g, '');
      if (!opts.toVendorCart && phone.length >= 10) {
        query['checkout[shipping_address][phone]'] = phone;
      }
    }
    return Vendor.url('/cart/' + items, query);
  }

  /** The receipt RRT keeps for a hand-off: what was sent, when, and the
   *  reference that rode along. RRT never claims more than the hand-off. */
  function handoffReceipt(sellable, rrtRef, quote) {
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
      vendor: Vendor.key,
      status: 'handed'
    };
    if (quote && quote.deliveryPaise != null) {
      order.deliveryPaise = quote.deliveryPaise;
      order.totalPaise = quote.totalPaise;
    }
    return saveReceipt(order);
  }

  /** Hand [lines] to the vendor's checkout, exactly as the app's
   *  startVendorCheckout does - mint a reference, keep a receipt, go.
   *
   *  For a Shopify Online Store the hand-off is a synchronous redirect to
   *  the cart permalink (or to the quoted cart's own checkout link) -
   *  instant, no API round-trip. Returns null when nothing is sellable.
   *  Other stores need a round-trip first: use startCheckout. */
  function beginCheckout(lines, opts) {
    opts = opts || {};
    var sellable = lines.filter(function (l) { return l.available && l.variantId > 0 && l.qty > 0; });
    if (!sellable.length) return null;
    // A valid quote means a cart already exists on the vendor's Shopify with
    // this exact address and delivery option: hand THAT off, so the vendor's
    // page shows the delivery charge and total the buyer has already seen.
    var quote = opts.quote && quoteMatches(opts.quote, lines, delivery()) ? opts.quote : null;
    var rrtRef = quote ? quote.rrtRef : newRrtRef();
    var order = handoffReceipt(sellable, rrtRef, quote);
    // The cart's own checkout link only when it is on the store's own site;
    // otherwise the cart link we build ourselves (same goods, same store).
    var url = quote && trustedCheckoutUrl(quote.checkoutUrl) ? quote.checkoutUrl : checkoutUrl(sellable, {
      buyerName: opts.buyerName, buyerPhone: opts.buyerPhone, rrtRef: rrtRef
    });
    return { order: order, url: url, quoted: !!quote };
  }

  /** A cart on a headless Shopify store, created for checkout when there is
   *  no delivery quote to hand off: the goods, the reference, and whatever
   *  of the buyer's details are known, so their checkout opens filled in. */
  function headlessCheckoutCart(sellable, rrtRef) {
    var d = delivery();
    var input;
    if (d && validateDelivery(d).ok) {
      input = cartInput(sellable, d, rrtRef);
    } else {
      input = {
        lines: sellable.map(function (l) {
          return { merchandiseId: 'gid://shopify/ProductVariant/' + l.variantId, quantity: l.qty };
        }),
        attributes: [{ key: 'source', value: 'RRT website' }, { key: 'rrt_ref', value: rrtRef }]
      };
    }
    var mutation = 'mutation RrtCheckoutCart($input: CartInput!) {' +
      ' cartCreate(input: $input) { cart { id checkoutUrl } userErrors { message field } } }';
    return gql(mutation, { input: input }, { fresh: true }).then(function (data) {
      var res = data && data.cartCreate;
      var msg = userErrorMessage(res && res.userErrors);
      if (msg) throw StorefrontError(msg);
      var url = res && res.cart && res.cart.checkoutUrl;
      if (!trustedCheckoutUrl(url)) throw StorefrontError('The store could not start checkout right now.');
      return url;
    });
  }

  /* ---------------------------------------------- WooCommerce hand-off */
  /* A WooCommerce cart lives in the buyer's session cookie on the store's own
   * site, and a web page on another site cannot write to it. What it can do
   * is open the store's own "add to cart" links in a window of the store's
   * site - exactly the links their product pages use - one line at a time,
   * then show their cart page with everything in it. The buyer pays there.
   * Anything already in their JustDogs cart from an earlier visit stays (no
   * other site can remove it); it shows on that cart page, where it can be
   * removed. A one-line bag needs no extra window: the current tab goes
   * straight to their cart page with the line added. */

  var WOO_STEP_MS = 3500;

  function wooUtm(q) {
    q.utm_source = 'rapid-response';
    q.utm_medium = 'website';
    q.utm_campaign = 'rrt-shop';
    return q;
  }

  /** The store's own add-to-cart link for one line, landing on its cart page. */
  function wooAddUrl(line, add) {
    var q = {};
    if (add && add.variation) {
      q['add-to-cart'] = String(add.product);
      q.variation_id = String(add.variation);
      Object.keys(add.attrs || {}).forEach(function (k) { q[k] = add.attrs[k]; });
    } else {
      q['add-to-cart'] = String(add && add.product ? add.product : line.variantId);
    }
    q.quantity = String(line.qty);
    return Vendor.url(Vendor.woo.cart, wooUtm(q));
  }

  /** The add-to-cart link of each line, from the live product record (cached
   *  minutes ago by the price check). A line whose product cannot be read
   *  falls back to its own id, which WooCommerce also accepts. */
  function wooAddUrls(sellable) {
    var handles = [];
    sellable.forEach(function (l) { if (handles.indexOf(l.handle) === -1) handles.push(l.handle); });
    return Promise.all(handles.map(function (h) {
      return wooProduct(h).catch(function () { return null; });
    })).then(function (products) {
      var byHandle = {};
      handles.forEach(function (h, i) { byHandle[h] = products[i]; });
      return sellable.map(function (l) {
        var p = byHandle[l.handle];
        var v = p && p.variantById(l.variantId);
        var add = v && v.wooAdd ? v.wooAdd : (l.productId && l.productId !== l.variantId
          ? { product: l.productId, variation: l.variantId, attrs: {} }
          : { product: l.variantId, variation: null, attrs: {} });
        return wooAddUrl(l, add);
      });
    });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** Walk [win] through [urls], then their cart page. [onStep](i, n) reports
   *  progress. Rejects if the window was closed on the way. */
  function wooFill(win, urls, onStep) {
    var i = 0;
    function next() {
      if (!win || win.closed) return Promise.reject(StorefrontError('The ' + Vendor.displayName + ' window was closed before your bag was added.'));
      if (i >= urls.length) {
        win.location.href = Vendor.url(Vendor.woo.cart, wooUtm({}));
        return Promise.resolve();
      }
      if (onStep) onStep(i + 1, urls.length);
      win.location.href = urls[i++];
      return sleep(WOO_STEP_MS).then(next);
    }
    return next();
  }

  /** Whether a checkout of [lines] needs a window of the store's own site
   *  (open it in the click handler, before anything asynchronous, or the
   *  browser blocks it). */
  function checkoutNeedsWindow(lines) {
    if (!IS_WOO) return false;
    return (lines || []).filter(function (l) { return l.available && l.variantId > 0 && l.qty > 0; }).length > 1;
  }

  /** Every store's hand-off, as a promise of { order, url, quoted, opened }.
   *    shopify_public    the permalink or quoted cart (same as beginCheckout)
   *    shopify_headless  the quoted cart's checkout, else a new cart's
   *    woocommerce       their cart page with the bag in it; with more than one
   *                      line, filled in [opts.window] (opened by the caller
   *                      during the click), and `opened` is true
   *  Navigate to `url` unless `opened`. Resolves null when nothing is sellable. */
  function startCheckout(lines, opts) {
    opts = opts || {};
    var sellable = lines.filter(function (l) { return l.available && l.variantId > 0 && l.qty > 0; });
    if (!sellable.length) return Promise.resolve(null);
    if (HAS_FEEDS) return Promise.resolve(beginCheckout(lines, opts));
    if (IS_HEADLESS) {
      var quote = opts.quote && quoteMatches(opts.quote, lines, delivery()) ? opts.quote : null;
      if (quote && trustedCheckoutUrl(quote.checkoutUrl)) {
        return Promise.resolve({ order: handoffReceipt(sellable, quote.rrtRef, quote), url: quote.checkoutUrl, quoted: true });
      }
      var ref = newRrtRef();
      return headlessCheckoutCart(sellable, ref).then(function (url) {
        return { order: handoffReceipt(sellable, ref, null), url: url, quoted: false };
      }, function () {
        // Last resort: the store's own cart link (Hydrogen serves /cart/{lines}).
        return { order: handoffReceipt(sellable, ref, null), url: checkoutUrl(sellable, { rrtRef: ref }), quoted: false };
      });
    }
    var rrtRef = newRrtRef();
    return wooAddUrls(sellable).then(function (urls) {
      if (urls.length === 1) {
        return { order: handoffReceipt(sellable, rrtRef, null), url: urls[0], quoted: false, opened: false };
      }
      var win = opts.window;
      if (!win || win.closed) {
        throw StorefrontError('Your browser blocked the ' + Vendor.displayName + ' window. Allow pop-ups for this site, then press checkout again.');
      }
      return wooFill(win, urls, opts.onStep).then(function () {
        return { order: handoffReceipt(sellable, rrtRef, null), url: Vendor.cartPageUrl, quoted: false, opened: true };
      });
    });
  }


  /* ======================================================== DELETE MY DATA */

  /** Clears everything the shop keeps in this browser: cart, saved items,
   *  receipts, the legacy pending flag and the response cache - the same
   *  promise the app's delete-my-data makes. */
  function deleteMyData() {
    [CART_KEY, SAVED_KEY, RECEIPTS_KEY, DELIVERY_KEY, 'rrt_store_pending_v1'].forEach(function (k) {
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

  /* The admin's veg-only switch as last read (rrt-store-config.js keeps it
   * here from Firestore), so a page opens already filtered instead of
   * flashing the full range until the live read lands. */
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
    startCheckout: startCheckout,
    checkoutNeedsWindow: checkoutNeedsWindow,
    quoteDelivery: quoteDelivery,
    selectDeliveryOption: selectDeliveryOption,
    quoteMatches: quoteMatches,
    stateCodes: STATE_CODES,
    indiaStates: INDIA_STATES,
    delivery: delivery,
    deliveryComplete: deliveryComplete,
    saveDelivery: saveDelivery,
    clearDelivery: clearDelivery,
    validateDelivery: function (raw) { return validateDelivery(normalizeDelivery(raw)); },
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
    setFetch: function (fn) { fetchImpl = fn; },
    setWooStepMs: function (ms) { WOO_STEP_MS = ms; },
    productFromWoo: productFromWoo,
    productFromWooFull: productFromWooFull,
    stores: { local: local, session: session }
  };

  global.RRTShop = api;
})(typeof window !== 'undefined' ? window : globalThis);
