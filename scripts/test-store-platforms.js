#!/usr/bin/env node
/**
 * The website's store SDK (assets/rrt-shop.js) on each KIND of partner store:
 *   zigly         Shopify Online Store (same reads as the first three stores)
 *   pawsandtails  headless Shopify: the Storefront API on its own site only,
 *                 checkout by cartCreate
 *   justdogs      WooCommerce: the Store API, checkout on its own cart page
 *
 * Each store gets its own fresh copy of the SDK in a sandbox, pinned to that
 * store, with the network replaced by recorded answers in the store's real
 * shapes (Store API records as JustDogs serves them, October 2026). No
 * network is touched.
 *
 * Run: node scripts/test-store-platforms.js
 */
'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rrt-shop.js'), 'utf8');
const BUNDLE = fs.readFileSync(path.join(__dirname, '..', 'assets', 'rrt-store-vendors.js'), 'utf8');
const REGISTRY = JSON.parse(BUNDLE.slice(BUNDLE.indexOf('{'), BUNDLE.lastIndexOf(';')));

let passed = 0;
let failed = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failed++;
  console.log(`  FAIL  ${name}\n        expected ${b}\n        got      ${a}`);
}
function ok(cond, name) { eq(!!cond, true, name); }

/** A fresh SDK pinned to [vendorId] (or following [published]). */
function load(vendorId, published) {
  const store = {};
  if (published) store.rrt_store_active_v1 = JSON.stringify(published);
  const ctx = {
    console, setTimeout, clearTimeout, URLSearchParams, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; }, key: (i) => Object.keys(store)[i] || null, get length() { return Object.keys(store).length; } },
  };
  ctx.globalThis = ctx; ctx.window = ctx;
  if (vendorId) ctx.RRT_SHOP_VENDOR = vendorId;
  vm.createContext(ctx);
  vm.runInContext(BUNDLE, ctx);
  vm.runInContext(SRC, ctx);
  return ctx.RRTShop;
}

function res(body, status) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({ status: status || 200, json: () => Promise.resolve(JSON.parse(text)) });
}

/* ------------------------------------------------- JustDogs recordings */

const WOO_PRICES = (p, r) => ({ price: p, regular_price: r || p, sale_price: p, price_range: null, currency_code: 'INR', currency_minor_unit: 0 });
const HARNESS = {
  id: 406687, name: 'Ezra Hart Padded Harness for Dogs, Red', slug: 'ezra-hart-padded-harness-for-dogs-red', parent: 0, type: 'variable',
  permalink: 'https://www.justdogsstore.com/products/ezra-hart-padded-harness-for-dogs-red/',
  description: '<p>A padded harness.</p>', short_description: '',
  prices: Object.assign(WOO_PRICES('3400'), { price_range: { min_amount: '3400', max_amount: '3500' } }),
  images: [{ id: 1, src: 'https://www.justdogsstore.com/wp-content/uploads/2026/06/h1.jpg', thumbnail: 'https://www.justdogsstore.com/wp-content/uploads/2026/06/h1-600x600.jpg' }],
  categories: [
    { id: 222, name: 'DOG', slug: 'dog', link: 'https://www.justdogsstore.com/product-category/dog/' },
    { id: 860, name: 'Harness', slug: 'harness', link: 'https://www.justdogsstore.com/product-category/dog/dog-leash-collar-harness/harness/' },
    { id: 674, name: 'Ezra', slug: 'ezra', link: 'https://www.justdogsstore.com/product-category/brands/ezra/' },
    { id: 631, name: 'Chow Chow', slug: 'chow-chow', link: 'https://www.justdogsstore.com/product-category/dog-breeds/chow-chow/' },
  ],
  tags: [],
  brands: [],
  attributes: [
    { id: 1, name: 'Brand', taxonomy: 'pa_brand', has_variations: false, terms: [{ id: 76, name: 'Ezra', slug: 'ezra' }] },
    { id: 15, name: 'Size', taxonomy: 'pa_size', has_variations: true, terms: [{ id: 598, name: 'Medium', slug: 'medium' }, { id: 597, name: 'Small', slug: 'small' }] },
  ],
  variations: [{ id: 406688, attributes: [{ name: 'Size', value: 'medium' }] }, { id: 406689, attributes: [{ name: 'Size', value: 'small' }] }],
  is_purchasable: true, is_in_stock: true,
  add_to_cart: { url: 'https://www.justdogsstore.com/products/ezra-hart-padded-harness-for-dogs-red/', minimum: 1, maximum: 9999, multiple_of: 1 },
};
const HARNESS_VARIATIONS = [
  { id: 406689, parent: 406687, type: 'variation', variation: 'Size: Small', prices: WOO_PRICES('3400'), is_purchasable: true, is_in_stock: true, images: [],
    add_to_cart: { url: 'https://www.justdogsstore.com/products/ezra-hart-padded-harness-for-dogs-red/?attribute_pa_size=small&#038;variation_id=406689&#038;add-to-cart=406687', maximum: 173 } },
  { id: 406688, parent: 406687, type: 'variation', variation: 'Size: Medium', prices: WOO_PRICES('3500'), is_purchasable: true, is_in_stock: false, images: [],
    add_to_cart: { url: 'https://www.justdogsstore.com/products/ezra-hart-padded-harness-for-dogs-red/?attribute_pa_size=medium&#038;variation_id=406688&#038;add-to-cart=406687', maximum: 12 } },
];
const BISCUITS = {
  id: 5001, name: 'Veg Dog Biscuits 500g', slug: 'veg-dog-biscuits', type: 'simple',
  description: '<p>Ingredients: wheat flour, rice, oats, carrot</p>',
  prices: WOO_PRICES('299', '349'),
  images: [{ src: 'https://www.justdogsstore.com/wp-content/uploads/b.jpg', thumbnail: 'https://www.justdogsstore.com/wp-content/uploads/b-600x600.jpg' }],
  categories: [{ name: 'Dog Treats', slug: 'dog-treats', link: 'https://www.justdogsstore.com/product-category/dog/dog-treats/' }],
  tags: [{ name: 'Vegetarian' }],
  attributes: [{ name: 'Brand', taxonomy: 'pa_brand', has_variations: false, terms: [{ name: 'Royal Canin', slug: 'royal-canin' }] }],
  variations: [], is_purchasable: true, is_in_stock: true,
  add_to_cart: { url: '?add-to-cart=5001', maximum: 4 },
};

function wooTests() {
  const S = load('justdogs');
  const V = S.vendor;
  eq(V.key, 'justdogs', 'JustDogs pinned');
  eq(V.platform, 'woocommerce', 'a WooCommerce store');
  eq(V.storefrontApiUrl, null, 'no Shopify API on a Woo store');
  eq(V.productUrl('veg-dog-biscuits'), 'https://www.justdogsstore.com/products/veg-dog-biscuits/', 'product links in the store’s own form');
  eq(V.cartPageUrl, 'https://www.justdogsstore.com/cart/', 'their cart page');
  S.__internal.setWooStepMs(5);

  const urls = [];
  S.__internal.setFetch(function (url) {
    url = String(url); urls.push(url);
    if (url.indexOf('/jd-api/wp-json/wc/store/v1/products/categories') === 0) {
      return res([{ slug: 'royal-canin', name: 'Royal Canin', count: 40 }, { slug: 'royal-treats', name: 'Royal Treats', count: 0 }, { slug: 'dog-food', name: 'Dog Food', count: 90 }]);
    }
    if (url.indexOf('parent=406687') !== -1) return res(HARNESS_VARIATIONS);
    if (url.indexOf('slug=ezra-hart-padded-harness-for-dogs-red') !== -1) return res([HARNESS]);
    if (url.indexOf('slug=veg-dog-biscuits') !== -1) return res([BISCUITS]);
    if (url.indexOf('slug=gone') !== -1) return res([]);
    if (url.indexOf('category=nope') !== -1) return res({ code: 'rest_invalid_param' }, 400);
    if (url.indexOf('/jd-api/wp-json/wc/store/v1/products?') === 0) return res([HARNESS, BISCUITS]);
    return res({}, 404);
  });

  return S.collectionPage('dog-treats', { sort: 'priceLow' }).then(function (page) {
    const u = urls[0];
    ok(u.indexOf('/jd-api/wp-json/wc/store/v1/products?') === 0, 'aisles read through the /jd-api route');
    ok(/category=dog-treats/.test(u) && /orderby=price/.test(u) && /order=asc/.test(u) && /per_page=24/.test(u) && /page=1/.test(u),
      'an aisle is a category, sorted by the store');
    eq(page.clientSort, false, 'the store sorts, not the browser');
    eq(page.endCursor, 'wp:2', 'next page cursor');
    const h = page.products[0];
    eq(h.handle, 'ezra-hart-padded-harness-for-dogs-red', 'slug is the handle');
    eq(h.brand, 'Ezra', 'brand from the Brand attribute');
    eq(h.productType, 'Harness', 'type: the deepest shop category, not a brand or breed');
    eq(h.cheapestVariant.pricePaise, 340000, '"3400" at minor unit 0 is ₹3,400');
    ok(h.priceVaries, 'a variable product shows its price range');
    eq(h.imageUrl, 'https://www.justdogsstore.com/wp-content/uploads/2026/06/h1-600x600.jpg', 'tiles use the 600px thumbnail');
    const b = page.products[1];
    eq(b.variants.length, 1, 'a simple product is its own variant');
    eq(b.variants[0].id, 5001, 'with the product id');
    eq(b.variants[0].compareAtPaise, 34900, 'regular price above the price is a sale');
    eq(b.variants[0].maxQty, 4, 'the store’s quantity limit');
    ok(b.isVeg, 'tags and an ingredient list read like Shopify’s');
    ok(b.tags.indexOf('Brand: Royal Canin') !== -1, 'attributes become "Name: value" tags');
    urls.length = 0;
    return S.collectionPage(V.catalogHandle, {});
  }).then(function () {
    ok(urls[0].indexOf('category=') === -1 && /orderby=popularity/.test(urls[0]), 'the catalogue: every product, best sellers first');
    return S.collectionPage('nope', {});
  }).then(function (page) {
    ok(page.missing, 'a category the store refuses is a missing aisle, not an error');
    urls.length = 0;
    return S.product('ezra-hart-padded-harness-for-dogs-red', { fresh: true });
  }).then(function (p) {
    eq(urls.length, 2, 'a variable product: the record, then its variations');
    ok(/parent=406687/.test(urls[1]) && /type=variation/.test(urls[1]), 'variations by parent');
    eq(p.partial, false, 'complete');
    eq(p.variants.map((v) => v.id), [406688, 406689], 'the store’s own order of choices');
    eq(p.variants.map((v) => v.optionValues), [['Medium'], ['Small']], 'choices named, not slugged');
    eq(p.options, [{ name: 'Size', values: ['Medium', 'Small'] }], 'one option, Size');
    eq(p.variantById(406688).available, false, 'per-variation stock');
    eq(p.variantById(406688).maxQty, 12, 'per-variation limit');
    eq(p.variantById(406689).maxQty, null, 'a large limit is no limit');
    eq(p.variantById(406689).wooAdd, { product: 406687, variation: 406689, attrs: { attribute_pa_size: 'small' } }, 'the store’s own add-to-cart link, decoded');
    eq(p.defaultVariant.id, 406689, 'the first variation in stock is the default');
    eq(p.imageUrl, 'https://www.justdogsstore.com/wp-content/uploads/2026/06/h1.jpg', 'the product page uses full images');
    return S.product('gone', {});
  }).then(function (p) {
    eq(p, null, 'a product the store removed is null');
    return S.suggest('royal');
  }).then(function (r) {
    eq(r.collections, [{ handle: 'royal-canin', title: 'Royal Canin' }], 'categories named by the words typed, empty ones left out');
    eq(r.products.length, 2, 'and the store’s product matches');
    urls.length = 0;
    return S.searchAll('harness', { after: 'wp:3' });
  }).then(function (r) {
    ok(/search=harness/.test(urls[0]) && /page=3/.test(urls[0]), 'full search pages through the store');
    eq(r.endCursor, 'wp:4', 'and keeps paging');
    urls.length = 0;
    return S.recommendations(406687);
  }).then(function (recs) {
    ok(/related=406687/.test(urls[0]), 'related products are WooCommerce’s own');
    eq(recs.map((p) => p.id), [5001], 'never the product itself');
    return S.brandPage('Royal Canin', {});
  }).then(function () {
    ok(urls.some((u) => /category=royal-canin/.test(u)), 'a brand is its category');
    return S.quoteDelivery([], {}).then(() => ok(false, 'no quote on Woo'), (e) => ok(/checkout page/.test(e.message), 'delivery is priced on their checkout page'));
  }).then(function () {
    // One-line bag: the current tab goes to their cart page with it added.
    S.clearCart();
    return S.product('ezra-hart-padded-harness-for-dogs-red').then(function (p) {
      S.add(p, p.variantById(406689), 2);
      eq(S.checkoutNeedsWindow(S.cart().lines), false, 'one line needs no extra window');
      return S.startCheckout(S.cart().lines, {});
    });
  }).then(function (h) {
    const u = new URL(h.url);
    eq(u.origin + u.pathname, 'https://www.justdogsstore.com/cart/', 'lands on their cart page');
    eq(u.searchParams.get('add-to-cart'), '406687', 'adds the product');
    eq(u.searchParams.get('variation_id'), '406689', 'in the chosen size');
    eq(u.searchParams.get('attribute_pa_size'), 'small', 'with the size named the store’s way');
    eq(u.searchParams.get('quantity'), '2', 'and the quantity');
    eq(u.searchParams.get('utm_source'), 'rapid-response', 'their order attribution sees RRT');
    eq(h.opened, false, 'navigate this tab');
    eq(S.receipt(h.order.id).status, 'handed', 'a receipt of the hand-off is kept');
    // Two lines: a window of their site, filled line by line, ending on the cart.
    return S.product('veg-dog-biscuits').then(function (p) {
      S.add(p, p.variants[0], 1);
      ok(S.checkoutNeedsWindow(S.cart().lines), 'two lines need their window');
      const visits = [];
      const win = { closed: false, location: {} };
      Object.defineProperty(win.location, 'href', { set: (v) => visits.push(v), get: () => visits[visits.length - 1] });
      const steps = [];
      return S.startCheckout(S.cart().lines, { window: win, onStep: (i, n) => steps.push(i + '/' + n) }).then(function (h2) {
        eq(visits.length, 3, 'one visit per line, then the cart');
        ok(/add-to-cart=406687/.test(visits[0]) && /add-to-cart=5001/.test(visits[1]), 'each line added with its own link');
        ok(/quantity=1/.test(visits[1]) && visits[1].indexOf('variation_id') === -1, 'a simple product needs no variation');
        eq(visits[2].replace(/\?.*$/, ''), 'https://www.justdogsstore.com/cart/', 'ends on their cart page');
        eq(steps, ['1/2', '2/2'], 'progress reported');
        eq(h2.opened, true, 'the window holds the checkout');
        return S.startCheckout(S.cart().lines, { window: null }).then(() => ok(false, 'blocked window must fail'),
          (e) => ok(/blocked/.test(e.message), 'a blocked window is explained, nothing half-sent'));
      });
    });
  }).then(function () {
    // Revalidation reads the live variation: price changes are caught.
    HARNESS_VARIATIONS[0].prices = WOO_PRICES('3600');
    return S.revalidateCart();
  }).then(function (r) {
    const change = r.changes.find((c) => c.type === 'price');
    ok(change && change.from === 340000 && change.to === 360000, 'a price change at JustDogs is caught before checkout');
  });
}

/* ------------------------------------------------- Paws & Tails (headless) */

function headlessTests() {
  const S = load('pawsandtails');
  const V = S.vendor;
  eq(V.platform, 'shopify_headless', 'Paws & Tails is headless Shopify');
  eq(V.storefrontApiUrl, '/pt-api/api/2026-01/graphql.json', 'its Storefront API through the same-origin route');
  const calls = [];
  let checkoutHost = 'checkout.pawsandtails24.com';
  S.__internal.setFetch(function (url, init) {
    url = String(url);
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ url, q: body ? body.query : null, v: body ? body.variables : null });
    if (url !== '/pt-api/api/2026-01/graphql.json') return res({}, 404);
    const q = body.query;
    if (/RrtCollection/.test(q)) {
      return res({ data: { collection: { products: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [
        { id: 'gid://shopify/Product/11', handle: 'drontal', title: 'Drontal Plus', vendor: 'Bayer', productType: 'Dewormer', availableForSale: true,
          featuredImage: { url: 'https://cdn.shopify.com/x.jpg' }, priceRange: { minVariantPrice: { amount: '120.0' }, maxVariantPrice: { amount: '120.0' } },
          compareAtPriceRange: { maxVariantPrice: { amount: '150.0' } }, tags: [] }] } } } });
    }
    if (/RrtProduct/.test(q)) {
      return res({ data: { product: { id: 'gid://shopify/Product/11', handle: 'drontal', title: 'Drontal Plus', vendor: 'Bayer', productType: 'Dewormer',
        descriptionHtml: '<p>x</p>', tags: [], featuredImage: { url: 'https://cdn.shopify.com/x.jpg' }, images: { nodes: [] }, options: [{ name: 'Title' }],
        variants: { nodes: [{ id: 'gid://shopify/ProductVariant/77', title: 'Default Title', availableForSale: true, price: { amount: '120.0' },
          compareAtPrice: null, selectedOptions: [{ name: 'Title', value: 'Default Title' }], quantityRule: { maximum: 5 } }] } } } });
    }
    if (/RrtSuggest/.test(q)) return res({ data: { predictiveSearch: { products: [], collections: [{ handle: 'deworming', title: 'Deworming' }] } } });
    if (/RrtCheckoutCart/.test(q)) {
      return res({ data: { cartCreate: { cart: { id: 'gid://shopify/Cart/z', checkoutUrl: 'https://' + checkoutHost + '/cart/c/z?key=k' }, userErrors: [] } } });
    }
    if (/RrtCartQuote/.test(q)) {
      return res({ data: { cartCreate: { userErrors: [], cart: { id: 'gid://shopify/Cart/q', checkoutUrl: 'https://pawsandtails24.com/cart/c/q?key=k',
        cost: { subtotalAmount: { amount: '120.0' }, totalAmount: { amount: '170.0' }, totalTaxAmount: { amount: '0.0' } },
        deliveryGroups: { nodes: [{ id: 'g1', deliveryOptions: [{ handle: 'std', title: 'Standard', deliveryMethodType: 'SHIPPING', estimatedCost: { amount: '50.0' } }],
          selectedDeliveryOption: { handle: 'std', estimatedCost: { amount: '50.0' } } }] } } } } });
    }
    return res({ errors: [{ message: 'unexpected query' }] });
  });

  return S.collectionPage('deworming', {}).then(function (page) {
    eq(calls.length, 1, 'one call');
    ok(/RrtCollection/.test(calls[0].q) && calls[0].v.handle === 'deworming', 'an aisle is a Storefront API collection');
    eq(page.products[0].cheapestVariant.pricePaise, 12000, 'priced from the API');
    eq(page.endCursor, 'c1', 'cursor paging');
    return S.previewCollection('deworming');
  }).then(function (tiles) {
    eq(tiles.length, 1, 'hub previews read the API too (there are no feeds)');
    return S.product('drontal', { fresh: true });
  }).then(function (p) {
    eq(p.variants[0].id, 77, 'the product page reads the API, not /products/x.js');
    eq(p.variants[0].maxQty, 5, 'with the store’s quantity rule');
    return S.suggest('dew');
  }).then(function (r) {
    eq(r.collections[0].handle, 'deworming', 'suggestions from predictive search');
    ok(calls.every((c) => c.url === '/pt-api/api/2026-01/graphql.json'), 'never a feed: every read is the API');
    return S.product('drontal');
  }).then(function (p) {
    S.clearCart();
    S.add(p, p.variants[0], 2);
    return S.startCheckout(S.cart().lines, {});
  }).then(function (h) {
    const last = calls[calls.length - 1];
    ok(/RrtCheckoutCart/.test(last.q), 'with no quote, a cart is created for checkout');
    eq(last.v.input.lines, [{ merchandiseId: 'gid://shopify/ProductVariant/77', quantity: 2 }], 'with the bag in it');
    ok(last.v.input.attributes.some((a) => a.key === 'rrt_ref' && a.value === h.order.rrtRef), 'and the reference on the order');
    eq(h.url, 'https://checkout.pawsandtails24.com/cart/c/z?key=k', 'their checkout on their own subdomain is trusted');
    checkoutHost = 'paws-and-tails.myshopify.com';
    return S.startCheckout(S.cart().lines, {});
  }).then(function (h) {
    eq(h.url, 'https://paws-and-tails.myshopify.com/cart/c/z?key=k', 'Shopify’s host for a headless shop is trusted');
    checkoutHost = 'evil.example';
    return S.startCheckout(S.cart().lines, {});
  }).then(function (h) {
    ok(h.url.indexOf('https://pawsandtails24.com/cart/77:2') === 0, 'a link anywhere else is refused: their own cart link instead');
    S.saveDelivery({ firstName: 'Asha', lastName: 'Rao', email: 'a@b.in', phone: '9876543210', address1: '12 MG Road', city: 'Kolkata', state: 'West Bengal', pin: '700001' });
    return S.quoteDelivery(S.cart().lines, S.delivery());
  }).then(function (q) {
    eq(q.totalPaise, 17000, 'delivery quoted by the store');
    const n = calls.length;
    return S.startCheckout(S.cart().lines, { quote: q }).then(function (h) {
      eq(calls.length, n, 'the quoted cart is handed off as is');
      eq(h.url, 'https://pawsandtails24.com/cart/c/q?key=k', 'on the quoted cart’s own checkout link');
      eq(h.order.totalPaise, 17000, 'the receipt carries the total the buyer saw');
    });
  });
}

/* ------------------------------------------------- publishing and routes */

function publishTests() {
  const pub = (d) => load(null, { configVersion: 3, active: d }).vendor.key;
  const def = REGISTRY.defaultActive;
  const firestore = (id) => {
    const d = JSON.parse(JSON.stringify(REGISTRY.vendors[id]));
    d.shelves.forEach((sh) => { sh.aisles = sh.aisles.map((a) => ({ label: a[0], handle: a[1] })); });
    return d;
  };
  eq(pub(firestore('justdogs')), 'justdogs', 'a published WooCommerce store is used');
  eq(pub(firestore('pawsandtails')), 'pawsandtails', 'a published headless store is used');
  eq(pub(firestore('zigly')), 'zigly', 'a published Zigly is used');
  const mutate = (id, fn) => { const d = firestore(id); fn(d); return pub(d); };
  eq(mutate('justdogs', (d) => { d.platform = 'shopify_public'; }), def, 'a Woo route cannot be read as Shopify');
  eq(mutate('pawsandtails', (d) => { d.web.proxyBase = '/jd-api'; d.domain = 'www.justdogsstore.com'; }), def, 'nor a headless store through the Woo route');
  eq(mutate('justdogs', (d) => { d.woo.api = '/wp-json/../../x'; }), def, 'an odd Store API path is refused');
  eq(mutate('justdogs', (d) => { d.woo.cart = '//evil.example/cart/'; }), def, 'a cart page off their site is refused');
  eq(mutate('justdogs', (d) => { d.checkout.mode = 'cart_permalink'; }), def, 'the checkout mode must match the platform');
  eq(mutate('pawsandtails', (d) => { d.storefrontApi.host = 'other.myshopify.com'; }), def, 'a headless API host other than the store’s is refused');
  const Z = load('zigly');
  eq(Z.vendor.feedUrl('/x.json'), '/zg-api/x.json', 'Zigly feeds through /zg-api');
  eq(Z.vendor.storefrontApiUrl, 'https://zigly-store.myshopify.com/api/2026-01/graphql.json', 'Zigly’s tokenless API on its myshopify host');
  eq(Z.vendor.whatsAppUrl('hi'), 'https://wa.me/917026391913?text=hi', 'Zigly support on WhatsApp');
}

Promise.resolve().then(wooTests).then(headlessTests).then(publishTests).then(function () {
  console.log(`store platforms: ${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}).catch(function (e) {
  console.error('  FAIL  unhandled: ' + (e && e.stack || e));
  process.exit(1);
});
