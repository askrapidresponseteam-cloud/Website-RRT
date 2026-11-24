#!/usr/bin/env node
/**
 * The website shop keeps loading when the store is busy (assets/rrt-shop.js
 * withRetries), the same rule as the app (storefront_resilience.dart):
 *   - "too many" (429), Shopify's bot screen (430), 5xx, a slow answer or a
 *     challenge page in place of JSON is asked again twice, 0.6 s then 1.2 s
 *     (plus jitter), or the store's own Retry-After up to 4 s;
 *   - a real answer (404, a GraphQL error) is never asked again;
 *   - only after the retries does a shelf fall over to the other door.
 * Every partner store's reads go through these two functions.
 *
 * Run: node scripts/test-shop-retry.js
 */
'use strict';
const path = require('path');

globalThis.RRT_SHOP_VENDOR = 'supertails';
globalThis.window = globalThis;
require(path.join(__dirname, '..', 'assets', 'rrt-store-vendors.js'));
require(path.join(__dirname, '..', 'assets', 'rrt-shop.js'));
const S = globalThis.RRTShop;

let failed = 0;
let passed = 0;
function ok(c, m) { if (c) { passed++; } else { failed++; console.log('  FAIL  ' + m); } }

const sleeps = [];
S.__internal.setSleep((ms) => { sleeps.push(ms); return Promise.resolve(); });

function tile(id) {
  return {
    id: 'gid://shopify/Product/' + id, handle: 'item-' + id, title: 'Item ' + id, vendor: 'Brand',
    productType: 'Medicine', availableForSale: true, featuredImage: null, publishedAt: null, tags: [],
    priceRange: { minVariantPrice: { amount: '100.0' }, maxVariantPrice: { amount: '100.0' } },
    compareAtPriceRange: { maxVariantPrice: { amount: '0.0' } },
  };
}
function feedItem(id) {
  return {
    id: id, title: 'Item ' + id, handle: 'item-' + id, vendor: 'Brand', product_type: 'Medicine', tags: [],
    variants: [{ id: id * 10, title: 'Default Title', option1: 'Default Title', price: '100.00', available: true }],
    images: [], options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
  };
}
function answer(status, body, headers) {
  return Promise.resolve({
    status: status,
    headers: { get: (k) => (headers || {})[String(k).toLowerCase()] || null },
    json: () => (body === undefined ? Promise.reject(new SyntaxError('not json')) : Promise.resolve(body)),
  });
}
const collection = (ids) => ({ data: { collection: { products: {
  filters: [], pageInfo: { hasNextPage: false, endCursor: null }, nodes: ids.map(tile) } } } });

function scenario(name, api, feed) {
  const calls = { api: 0, feed: 0 };
  sleeps.length = 0;
  if (S.__internal.resetTransport) S.__internal.resetTransport();
  S.__internal.setFetch((url, init) => {
    if (String(url).indexOf('graphql.json') !== -1) { calls.api++; return api(calls.api, init); }
    calls.feed++;
    return feed(calls.feed, url);
  });
  return calls;
}

(async () => {
  // 1. The API is busy twice, then answers: the shelf loads, no switch.
  let c = scenario('busy twice', (n) => (n < 3 ? answer(430, {}) : answer(200, collection([1, 2]))),
    () => answer(200, { products: [feedItem(9)] }));
  let page = await S.collectionPage('pet-pharmacy');
  ok(c.api === 3, 'API asked three times (got ' + c.api + ')');
  ok(c.feed === 0, 'no switch to the feed while a retry worked');
  ok(page.products.map((p) => p.id).join() === '1,2', 'the shelf is the API answer');
  ok(sleeps.length === 2 && sleeps[0] >= 600 && sleeps[0] < 850 && sleeps[1] >= 1200 && sleeps[1] < 1450,
    'waits 0.6 s then 1.2 s, plus jitter (got ' + sleeps.join(',') + ')');

  // 2. Retry-After 10 s: waited 4 s at most.
  c = scenario('retry-after', (n) => (n < 2 ? answer(429, {}, { 'retry-after': '10' }) : answer(200, collection([3]))),
    () => answer(200, { products: [] }));
  page = await S.collectionPage('pet-pharmacy-dewormer');
  ok(sleeps.length === 1 && sleeps[0] === 4000, 'the store\'s 10 s wait is capped at 4 s (got ' + sleeps.join(',') + ')');
  ok(page.products[0] && page.products[0].id === 3, 'then the shelf loads');

  // 3. A challenge page in place of JSON: asked again.
  c = scenario('challenge', (n) => (n === 1 ? answer(200, undefined) : answer(200, collection([4]))),
    () => answer(200, { products: [] }));
  page = await S.collectionPage('pet-skin-care');
  ok(c.api === 2 && page.products[0] && page.products[0].id === 4, 'a challenge page is retried (API calls ' + c.api + ')');

  // 4. The API keeps refusing: three tries, then the feed stands in.
  c = scenario('api down', () => answer(430, {}), () => answer(200, { products: [feedItem(5)] }));
  page = await S.collectionPage('wound-medicine-for-dogs-cats');
  ok(c.api === 3, 'API tried three times before switching (got ' + c.api + ')');
  ok(c.feed >= 1 && page.products.some((p) => p.id === 5), 'the feed stands in');

  // 5. The feed itself is busy once: retried there too.
  c = scenario('feed busy', () => answer(430, {}), (n) => (n === 1 ? answer(503, {}) : answer(200, { products: [feedItem(6)] })));
  page = await S.collectionPage('antifungal-antibiotics-for-pets');
  ok(page.products.some((p) => p.id === 6), 'a busy feed is retried and then answers');

  // 6. A real answer is final: a GraphQL error is not asked again.
  c = scenario('graphql error', () => answer(200, { errors: [{ message: 'Internal error', extensions: { code: 'INTERNAL_SERVER_ERROR' } }] }),
    () => answer(200, { products: [feedItem(7)] }));
  sleeps.length = 0;
  await S.collectionPage('calcium-supplements-for-dogs-cats').catch(() => null);
  ok(c.api === 1, 'a GraphQL error is not retried (API calls ' + c.api + ')');
  ok(sleeps.length === 0, 'and nothing waited');

  // 7. A 404 is final.
  c = scenario('404', () => answer(404, {}), () => answer(404, {}));
  sleeps.length = 0;
  await S.collectionPage('gone-aisle').catch(() => null);
  ok(sleeps.length === 0, 'a 404 is never retried');

  console.log(failed ? 'shop retry: ' + failed + ' FAILED, ' + passed + ' passed' : 'shop retry: ' + passed + ' passed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log('FAIL ' + (e && e.stack || e)); process.exit(1); });
