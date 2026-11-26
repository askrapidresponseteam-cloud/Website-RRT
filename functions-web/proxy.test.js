'use strict';
/* node functions-web/proxy.test.js : the store proxy forwards only what vercel.json allowed. */
const assert = require('assert');
const { route, upstreamHeaders, responseHeaders } = require('./proxy');
const R = require('./routes.json').proxies;

let n = 0;
function ok(name, fn) { fn(); n += 1; }
const go = (m, p) => route(R, m, p.split('?')[0], p);

ok('Shopify collection feed with query', () => {
  assert.deepStrictEqual(go('GET', '/st-api/collections/dog-food/products.json?limit=250&page=2'),
    { url: 'https://supertails.com/collections/dog-food/products.json?limit=250&page=2' });
});
ok('product .js file', () => {
  assert.strictEqual(go('GET', '/huft-api/products/some-bed.js').url, 'https://headsupfortails.com/products/some-bed.js');
});
ok('product path that is not .js is refused', () => {
  assert.strictEqual(go('GET', '/huft-api/products/some-bed'), null);
});
ok('every store reaches only its own host', () => {
  const want = { '/st-api': 'supertails.com', '/pl-api': 'www.pets-lifestyle.com', '/huft-api': 'headsupfortails.com', '/zg-api': 'zigly.com',
    '/pt-api': 'pawsandtails24.com', '/jd-api': 'www.justdogsstore.com', '/wk-api': 'whiskeepetzone.com' };
  for (const p of R) assert.strictEqual(new URL(p.dest.replace(/\$\d/g, 'x')).host, want[p.prefix], p.prefix);
  assert.strictEqual(Object.keys(want).length, new Set(R.map((p) => p.prefix)).size);
});
ok('host smuggling in a handle stays on the store', () => {
  const hit = go('GET', '/st-api/collections/%40evil.com/products.json');
  assert.strictEqual(new URL(hit.url).host, 'supertails.com');
  assert.strictEqual(go('GET', '/st-api/collections/a%2F..%2F..%2Fadmin/products.json'), null);
  const enc = go('GET', '/st-api/collections/a%2F%2e%2e%2F%2e%2e%2Fadmin/products.json');
  assert.ok(enc.url.startsWith('https://supertails.com/collections/') && new URL(enc.url).pathname.endsWith('/products.json'), enc.url);
});
ok('dot-dot and unknown paths are refused', () => {
  assert.strictEqual(go('GET', '/st-api/../admin'), null);
  assert.strictEqual(go('GET', '/st-api/admin'), null);
  assert.strictEqual(go('GET', '/xx-api/collections/a/products.json'), null);
});
ok('WooCommerce numeric attribute terms only', () => {
  assert.strictEqual(go('GET', '/jd-api/wp-json/wc/store/v1/products/attributes/12/terms').url,
    'https://www.justdogsstore.com/wp-json/wc/store/v1/products/attributes/12/terms');
  assert.strictEqual(go('GET', '/jd-api/wp-json/wc/store/v1/products/attributes/x/terms'), null);
  assert.strictEqual(go('GET', '/wk-api/wp-json/wc/store/v1/cart'), null);
});
ok('POST only on the Storefront GraphQL route', () => {
  assert.strictEqual(go('POST', '/pt-api/api/2025-07/graphql.json').url, 'https://pawsandtails24.com/api/2025-07/graphql.json');
  assert.strictEqual(go('POST', '/st-api/search/suggest.json'), false);
  assert.strictEqual(go('DELETE', '/pt-api/api/2025-07/graphql.json'), false);
  assert.strictEqual(go('POST', '/pt-api/api/latest/graphql.json'), null);
});
ok('huge query strings are refused', () => {
  assert.strictEqual(go('GET', '/st-api/search/suggest.json?q=' + 'a'.repeat(3000)), null);
});
ok('no cookies or auth go to the store', () => {
  const h = upstreamHeaders({ cookie: 'a=b', authorization: 'Bearer x', accept: 'application/json', 'x-forwarded-for': '1.2.3.4' });
  assert.deepStrictEqual(h, { accept: 'application/json' });
});
ok('store cookies never come back, reads are cached briefly', () => {
  const up = { status: 200, headers: new Map([['content-type', 'application/json'], ['set-cookie', 'x=y']]) };
  const h = responseHeaders(up, 'GET');
  assert.strictEqual(h['Set-Cookie'], undefined);
  assert.strictEqual(h['Cache-Control'], 'public, max-age=60, s-maxage=300');
  assert.strictEqual(h['X-Frame-Options'], 'DENY');
  assert.strictEqual(responseHeaders({ status: 429, headers: new Map() }, 'GET')['Cache-Control'], 'no-store');
  assert.strictEqual(responseHeaders(up, 'POST')['Cache-Control'], 'no-store');
});
ok('every vercel.json store route is covered', () => {
  const v = require('../vercel.json');
  assert.strictEqual(R.length, v.rewrites.filter((r) => /^https:/.test(r.destination)).length);
});
console.log('store proxy: ' + n + ' checks passed');
