#!/usr/bin/env node
/**
 * The Supertails shop display (flags.store_live) on the real /shop page in a real browser, the
 * stores answered by stubs (from test-shop-simple.js):
 *   - the shelves and aisles are the store's own menu (the published one, else the saved copy),
 *     in its order; no RRT brand row; the listing is the store's own collection in its own order;
 *     sold-out products listed and marked, as on the store's site;
 *   - a store without a menu of its own keeps the current display.
 * The two shop display styles (flags.store_simple) are tested in test-shop-simple.js.
 *
 * (the harness below is that test's)
 * The two shop display styles (flags.store_simple) on the real /shop page in
 * a real browser, for each kind of partner store, every store answered by
 * stubs: Supertails (Shopify Online Store: feeds and the Storefront API),
 * Paws & Tails (Shopify behind its own front end: the API on its own site) and
 * JustDogs (WooCommerce: the Store API).
 *
 *   Current      shelves, aisles, brands, every sort (highest discount too:
 *                the whole listing read, then the biggest % off first, sold
 *                out last), sold out products listed and marked;
 *   Simplified   an animal row and a category row only, no brands or aisles,
 *                no price sort, nothing sold out; an animal and a category
 *                read the store's own collections for them, one after the
 *                other, and never show another animal's products; old shelf
 *                links land on their animal and category; search hides sold
 *                out too.
 *
 * Run: node scripts/test-shop-simple.js
 * Skips (exit 0) where Playwright is not installed.
 */
'use strict';
const path = require('path');
const { spawn } = require('child_process');

function playwright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* next */ }
  }
  return null;
}
const PW = playwright();
if (!PW) { console.log('shop display styles: skipped (Playwright not installed)'); process.exit(0); }
const { chromium } = PW;

/* One store's products: every collection has six, the first sold out. A
 * collection named for an animal holds that animal's products; any other
 * holds products for any pet plus one for dogs and one for cats, so the
 * animal filter has something to take away. */
function titlesFor(handle, n) {
  const h = String(handle);
  if (h === 'all' || h === 'search') {
    const kinds = ['Dog Kibble', 'Cat Litter', 'Bird Seed Mix', 'Pet Steel Bowl', 'Puppy Shampoo', 'Kitten Toy'];
    return Array.from({ length: n }, (_, i) => kinds[i % kinds.length] + ' ' + h + ' ' + i);
  }
  const dog = /dog|puppy/.test(h), cat = /cat|kitten|litter/.test(h);
  return Array.from({ length: n }, (_, i) => {
    if (dog) return 'Dog ' + h + ' ' + i;
    if (cat) return 'Cat ' + h + ' ' + i;
    if (i === 4) return 'Dog only ' + h;
    if (i === 5) return 'Kitten ' + h;
    return 'Pet ' + h + ' ' + i;
  });
}
let nextId = 1;
const ids = {};
function idOf(key) { if (!ids[key]) ids[key] = nextId++; return ids[key]; }
function items(handle, page) {
  const size = handle === 'all' ? 24 : 6;
  const list = titlesFor(handle + (page > 1 ? '-p' + page : ''), size).map((title, i) => ({
    id: idOf(handle + '|' + page + '|' + i), handle: (handle + '-' + page + '-' + i).replace(/[^a-z0-9-]/g, ''), title,
    soldOut: i === 0, tags: [], type: '', compareAt: compareAtFor(page, i)
  }));
  // What the store also lists that the Supertails display must never show: near-Rs 0 items and
  // clinic or service items (by title, by type, by brand).
  if (page === 1) EXTRAS.forEach((x, i) => list.push(Object.assign({ id: idOf(handle + '|x|' + i), handle: (handle + '-x-' + i).replace(/[^a-z0-9-]/g, ''),
    soldOut: false, tags: [], type: '', compareAt: 0 }, x)));
  return list;
}
const EXTRAS = [
  { title: 'Free Gift Treat Pouch', price: 0 },
  { title: 'Chew Toy Add-on', price: 1 },
  { title: 'Bone Bite Mini', price: 9 },
  { title: 'Vet Consultation at Supertails Clinic', price: 499 },
  { title: 'Full Body Grooming Session', price: 899, type: 'Service' },
  { title: 'Health Checkup Package', price: 1299, brand: 'Supertails Clinic' },
  { title: 'Digital Gift Card', price: 500 }
];
const EXTRA_RE = /Free Gift|Chew Toy Add-on|Bone Bite Mini|Consultation|Grooming Session|Health Checkup|Gift Card/;
/* Some products on sale (price 100 each): the biggest discount (75% off) is
 * on the second page, and a sold-out product with 80% off on the first. */
function compareAtFor(page, i) {
  if (i === 0) return 500;
  if (page === 2 && i === 7) return 400;
  if (i % 4 === 1) return 100 + 10 * ((i % 10) + 1);
  return 0;
}
const PAGES = { all: 2 };
const OPTS = {};
const sortsAsked = [];
const pagesOf = (h) => PAGES[h] || 1;

function feedJson(list) {
  return { products: list.map((p) => ({ id: p.id, handle: p.handle, title: p.title, vendor: p.brand || 'Brand', product_type: p.type,
    tags: p.tags, images: [], options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    variants: [{ id: p.id * 10, title: 'Default Title', option1: 'Default Title', price: (p.price != null ? p.price : 100) + '.00', available: !p.soldOut,
      compare_at_price: p.compareAt ? p.compareAt + '.00' : null }] })) };
}
function gqlNode(p) {
  return { id: 'gid://shopify/Product/' + p.id, handle: p.handle, title: p.title, vendor: p.brand || 'Brand', productType: p.type,
    availableForSale: !p.soldOut, publishedAt: '2026-01-01T00:00:00Z', featuredImage: null, tags: p.tags,
    priceRange: { minVariantPrice: { amount: (p.price != null ? p.price : 100) + '.0' }, maxVariantPrice: { amount: (p.price != null ? p.price : 100) + '.0' } },
    compareAtPriceRange: { maxVariantPrice: { amount: p.compareAt ? p.compareAt + '.0' : '0' } } };
}
function wooJson(p) {
  return { id: p.id, name: p.title, slug: p.handle, type: 'simple', parent: 0, description: '', short_description: '',
    prices: { price: '100', regular_price: String(p.compareAt || 100), sale_price: '100', price_range: null, currency_code: 'INR', currency_minor_unit: 0 },
    images: [], categories: [], tags: [], attributes: [], variations: [], is_purchasable: true, is_in_stock: !p.soldOut,
    add_to_cart: { url: '?add-to-cart=' + p.id, maximum: 9999 } };
}

const PORT = 19000 + Math.floor(Math.random() * 900);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)],
  { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
const pass = (m) => console.log('ok   ' + m);
let lastLook = null;
const check = (c, m) => (c ? pass(m) : fail(m + (lastLook ? '\n       ' + JSON.stringify(lastLook).slice(0, 600) : '')));

async function openShop(browser, store, simple, query) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const asked = [];
  page.on('pageerror', (e) => fail(store + ': page error: ' + e.message));
  await page.addInitScript(([id, on, menu]) => {
    window.RRT_SHOP_VENDOR = id;
    try {
      localStorage.setItem('rrt_store_simple', 'false');
      localStorage.setItem('rrt_store_live', on ? 'true' : 'false');
      if (menu) localStorage.setItem('rrt_store_live_menu', JSON.stringify(menu)); else localStorage.removeItem('rrt_store_live_menu');
    } catch (e) { /* none */ }
  }, [store, simple, OPTS.menu || null]);
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    // Shopify feeds (Supertails' landing).
    let m = /^\/[a-z]+-api\/collections\/([^/]+)\/products\.json$/.exec(url.pathname);
    if (req.url().startsWith(BASE) && m) {
      const h = decodeURIComponent(m[1]); const p = Number(url.searchParams.get('page') || '1');
      asked.push(h + ':' + p);
      return json(feedJson(p <= pagesOf(h) ? items(h, p) : []));
    }
    // The Storefront API: on Shopify's host, or on the store's own site.
    if (/\/api\/\d{4}-\d{2}\/graphql\.json$/.test(url.pathname)) {
      const body = JSON.parse(req.postData() || '{}');
      const v = body.variables || {};
      const qtext = String(body.query || '');
      const h = /collection\(handle/.test(qtext) ? v.handle : (/search\(/.test(qtext) ? 'search' : 'all');
      if (v.sortKey) sortsAsked.push(v.sortKey);
      const p = v.after ? Number(String(v.after).slice(1)) : 1;
      asked.push(h + ':' + p);
      const list = p <= pagesOf(h) ? items(h, p) : [];
      const conn = { pageInfo: { hasNextPage: p < pagesOf(h), endCursor: 'c' + (p + 1) }, nodes: list.map(gqlNode) };
      if (h === 'search') return json({ data: { search: Object.assign({ totalCount: list.length }, conn) } });
      if (h === 'all') return json({ data: { products: conn } });
      return json({ data: { collection: { products: conn } } });
    }
    // WooCommerce's Store API.
    m = /^\/[a-z]+-api\/wp-json\/wc\/store\/v1\/products$/.exec(url.pathname);
    if (req.url().startsWith(BASE) && m) {
      const h = url.searchParams.get('category') || (url.searchParams.get('search') ? 'search' : 'all');
      const p = Number(url.searchParams.get('page') || '1');
      asked.push(h + ':' + p);
      const size = Number(url.searchParams.get('per_page') || '24');
      const list = p <= pagesOf(h) ? items(h, p).slice(0, size) : [];
      return json(list.map(wooJson));
    }
    if (/^\/[a-z]+-api\/wp-json\/wc\/store\/v1\/products\/categories$/.test(url.pathname)) return json([]);
    // No Firebase here: the display style is the one this device last read
    // (rrt-store-config.js runs on it when Firestore cannot be reached).
    if (/\/assets\/vendor\/firebase-/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    if (req.url().startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(BASE + '/shop' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0 ||
    !document.getElementById('state').hidden, null, { timeout: 15000 });
  // Let paging and the fill settle.
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  // SHOTS=dir saves what each check saw (for a look by eye).
  if (process.env.SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(process.env.SHOTS, store + (simple ? '-simple' : '-current') + (query || '').replace(/[^a-z0-9]+/gi, '_') + '.png') });
  }
  return { page, asked };
}

async function look(page) {
  lastLook = await page.evaluate(() => {
    const tiles = Array.prototype.filter.call(document.querySelectorAll('#grid > *'), (el) => !el.classList.contains('skel-tile'));
    const bar = (id) => { const b = document.getElementById(id); return b && !b.hidden ? Array.prototype.map.call(b.querySelectorAll('a'), (a) => a.textContent.trim()) : null; };
    return {
      tiles: tiles.map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      shelves: bar('shelfBar'), aisles: bar('aisleBar'), brands: bar('brandBar'),
      pressed: Array.prototype.map.call(document.querySelectorAll('.category[aria-pressed="true"]'), (a) => a.textContent.trim()),
      sorts: Array.prototype.map.call(document.querySelectorAll('#sort option'), (o) => o.value),
      title: document.getElementById('pageTitle').textContent.trim(),
      state: document.getElementById('state').hidden ? '' : document.getElementById('state').textContent.trim()
    };
  });
  return lastLook;
}

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/shop'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await chromium.launch(); } catch (e) {
    console.log('shop Supertails display: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }
  const fs = require('fs');
  global.window = {};
  eval(fs.readFileSync(path.join(__dirname, '..', 'assets', 'rrt-store-live.js'), 'utf8'));
  const SAVED = global.window.RRT_STORE_LIVE.stores.supertails.shelves;

  // Supertails with the display on and nothing published yet: the saved copy of its menu.
  let { page, asked } = await openShop(browser, 'supertails', true, '');
  let v = await look(page);
  check(JSON.stringify(v.shelves) === JSON.stringify(['All'].concat(SAVED.map((s) => s.name))), 'supertails: the shelf row is the store’s own menu, in its order ' + JSON.stringify(v.shelves));
  check(v.brands === null || v.brands.length === 0, 'supertails: no RRT brand row');
  check(v.tiles.some((t) => /Sold out/i.test(t)), 'supertails: sold-out products listed and marked, as on its site');
  check(v.sorts[0] === 'featured', 'supertails: the store’s own order first');
  check(v.tiles.length > 0 && !v.tiles.some((t) => EXTRA_RE.test(t)), 'supertails: no near-Rs 0 items and no clinic or service items (' + v.tiles.filter((t) => EXTRA_RE.test(t)).length + ' shown)');
  await page.close();

  ({ page } = await openShop(browser, 'supertails', true, '?q=consultation'));
  v = await look(page);
  check(!v.tiles.some((t) => EXTRA_RE.test(t)), 'supertails: search leaves them out too');
  await page.close();

  ({ page } = await openShop(browser, 'supertails', true, ''));
  const one = await page.evaluate(() => {
    const S = window.RRTShop;
    const mk = (title, price, extra) => Object.assign({ title, productType: '', brand: 'Brand', tags: [], cheapestVariant: { pricePaise: price * 100 } }, extra || {});
    return {
      free: S.liveExcluded(mk('Free Gift', 0)), ten: S.liveExcluded(mk('Treat', 10)), eleven: S.liveExcluded(mk('Treat', 11)),
      grooming: S.liveExcluded(mk('Dog Grooming Shampoo 200ml', 349)), clinic: S.liveExcluded(mk('Kitten Vaccination Package', 1499)),
      type: S.liveExcluded(mk('Spa Day', 799, { productType: 'Services' })), tag: S.liveExcluded(mk('Ear Check', 299, { tags: ['Clinic'] }))
    };
  });
  check(one.free && one.ten && !one.eleven, 'supertails: Rs 10 or less is left out, Rs 11 shows (' + JSON.stringify(one) + ')');
  check(!one.grooming, 'supertails: grooming products stay (only grooming sessions go)');
  check(one.clinic && one.type && one.tag, 'supertails: clinic items go by their title, their type or their tags');
  await page.close();

  ({ page, asked } = await openShop(browser, 'supertails', true, '?shelf=dogs'));
  v = await look(page);
  check(v.title === 'Dogs', 'supertails: a menu item opens (' + v.title + ')');
  check(JSON.stringify(v.aisles) === JSON.stringify(SAVED[0].aisles.map((a) => a[0])), 'supertails: its sections, in the menu’s order (' + (v.aisles || []).slice(0, 5).join(', ') + ' ...)');
  check(asked.some((a) => a.indexOf('dog-food:') === 0), 'supertails: the first section’s collection, read live from the store (' + asked.slice(0, 3).join(' ') + ')');
  check(!sortsAsked.length || sortsAsked.every((k) => k === 'COLLECTION_DEFAULT'), 'supertails: in the store’s own order (' + [...new Set(sortsAsked)].join() + ')');
  check(await page.evaluate(() => /own site/.test(document.getElementById('pageCopy').textContent)), 'supertails: the page says it is as on the store’s own site');
  await page.close();

  // The menu the backend read from the site wins over the saved copy.
  OPTS.menu = { store: 'supertails', source: 'live', read_at: 1, shelves: [
    { key: 'offer-zone', name: 'Offer Zone', aisles: [{ label: 'All', handle: 'superdeals' }] },
    { key: 'dogs', name: 'Dogs', aisles: [{ label: 'Dog Food', handle: 'dog-food' }, { label: 'Toys', handle: 'dog-toys' }] },
    { key: 'cats', name: 'Cats', aisles: [{ label: 'Cat Food', handle: 'cat-food' }] },
    { key: 'bad', name: 'Bad', aisles: [{ label: 'Nope', handle: '../x' }] }] };
  ({ page } = await openShop(browser, 'supertails', true, ''));
  v = await look(page);
  check(JSON.stringify(v.shelves) === JSON.stringify(['All', 'Offer Zone', 'Dogs', 'Cats']), 'supertails: the menu read from its site wins, and a bad entry is dropped ' + JSON.stringify(v.shelves));
  await page.close();
  OPTS.menu = null;

  // A store with no menu of its own: the current display, as before.
  ({ page } = await openShop(browser, 'pawsandtails', true, ''));
  v = await look(page);
  check(v.shelves && v.shelves[0] === 'All' && !v.shelves.includes('Dogs') && v.shelves.length > 4, 'pawsandtails: no menu of its own, the current display ' + JSON.stringify(v.shelves));
  await page.close();

  // The display off: RRT's shelves for Supertails too.
  ({ page } = await openShop(browser, 'supertails', false, ''));
  v = await look(page);
  check(v.shelves && v.shelves.includes('Pharmacy') && v.shelves.includes('Dog Food') && v.brands && v.brands.length > 0, 'supertails, display off: RRT’s shelves and brands as before');
  check(v.tiles.some((t) => EXTRA_RE.test(t)), 'supertails, display off: the other displays list as before (unchanged)');
  await page.close();

  await browser.close();
  console.log(process.exitCode ? 'shop Supertails display: FAILED' : 'shop Supertails display: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
