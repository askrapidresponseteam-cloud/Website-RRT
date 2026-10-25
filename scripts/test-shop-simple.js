#!/usr/bin/env node
/**
 * The two shop display styles (flags.store_simple) on the real /shop page in
 * a real browser, for each kind of partner store, every store answered by
 * stubs: Supertails (Shopify Online Store: feeds and the Storefront API),
 * Paws & Tails (Shopify behind its own front end: the API on its own site) and
 * JustDogs (WooCommerce: the Store API).
 *
 *   Current      exactly as before: shelves, aisles, brands, four sorts, sold
 *                out products listed and marked;
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
  return titlesFor(handle + (page > 1 ? '-p' + page : ''), size).map((title, i) => ({
    id: idOf(handle + '|' + page + '|' + i), handle: (handle + '-' + page + '-' + i).replace(/[^a-z0-9-]/g, ''), title,
    soldOut: i === 0, tags: [], type: ''
  }));
}
const PAGES = { all: 2 };
const pagesOf = (h) => PAGES[h] || 1;

function feedJson(list) {
  return { products: list.map((p) => ({ id: p.id, handle: p.handle, title: p.title, vendor: 'Brand', product_type: p.type,
    tags: p.tags, images: [], options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    variants: [{ id: p.id * 10, title: 'Default Title', option1: 'Default Title', price: '100.00', available: !p.soldOut }] })) };
}
function gqlNode(p) {
  return { id: 'gid://shopify/Product/' + p.id, handle: p.handle, title: p.title, vendor: 'Brand', productType: p.type,
    availableForSale: !p.soldOut, publishedAt: '2026-01-01T00:00:00Z', featuredImage: null, tags: p.tags,
    priceRange: { minVariantPrice: { amount: '100.0' }, maxVariantPrice: { amount: '100.0' } },
    compareAtPriceRange: { maxVariantPrice: { amount: '0' } } };
}
function wooJson(p) {
  return { id: p.id, name: p.title, slug: p.handle, type: 'simple', parent: 0, description: '', short_description: '',
    prices: { price: '100', regular_price: '100', sale_price: '100', price_range: null, currency_code: 'INR', currency_minor_unit: 0 },
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
  await page.addInitScript(([id, on]) => {
    window.RRT_SHOP_VENDOR = id;
    try { localStorage.setItem('rrt_store_simple', on ? 'true' : 'false'); } catch (e) { /* none */ }
  }, [store, simple]);
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
    console.log('shop display styles: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }

  const STORES = [
    { id: 'supertails', kind: 'Shopify', cat: '?for=cat&show=treats', catSources: ['training-treats-1', 'cat-treats', 'creamy-treats-for-cats'] },
    { id: 'pawsandtails', kind: 'Shopify headless', cat: '?for=cat&show=gear', catSources: ['accessories'] },
    { id: 'justdogs', kind: 'WooCommerce', cat: '?for=cat&show=treats', catSources: ['dental-treats', 'natural-treats', 'cat-treat', 'creamy-treats', 'chewy-treats'] },
  ];
  for (const st of STORES) {
    const tag = st.id + ' (' + st.kind + ')';

    // Current: exactly as before.
    let { page } = await openShop(browser, st.id, false, '');
    let v = await look(page);
    check(v.sorts.join() === 'featured,newest,priceLow,priceHigh', tag + ' current: all four sorts');
    check(v.shelves && v.shelves[0] === 'All' && v.shelves.length > 4 && !v.shelves.includes('Dogs'), tag + ' current: the shelf row');
    check(v.tiles.some((t) => /Sold out/i.test(t)), tag + ' current: sold-out products listed, marked sold out');
    check(st.id === 'justdogs' || st.id === 'pawsandtails' || (v.brands && v.brands.length > 0), tag + ' current: brands as before');
    await page.close();
    ({ page } = await openShop(browser, st.id, false, '?shelf=pharmacy'));
    v = await look(page);
    check(v.aisles && v.aisles.length > 1 && v.title === 'Pharmacy', tag + ' current: a shelf opens with its aisles');
    await page.close();

    // Simplified: the landing.
    ({ page } = await openShop(browser, st.id, true, ''));
    v = await look(page);
    check(v.sorts.join() === 'featured,newest', tag + ' simplified: no price sort');
    check(v.shelves && v.shelves[0] === 'All pets' && v.shelves.includes('Dogs') && v.shelves.includes('Cats'), tag + ' simplified: the animal row ' + JSON.stringify(v.shelves));
    check(v.aisles && v.aisles[0] === 'All products' && v.aisles.includes('Medicines') && v.aisles.includes('Food'), tag + ' simplified: the category row ' + JSON.stringify(v.aisles));
    check(v.brands === null, tag + ' simplified: no brands');
    check(v.tiles.length > 0 && !v.tiles.some((t) => /Sold out/i.test(t)), tag + ' simplified: ' + v.tiles.length + ' products, none sold out');
    await page.close();

    // Simplified: an animal and a category.
    let asked;
    ({ page, asked } = await openShop(browser, st.id, true, st.cat));
    v = await look(page);
    check(v.pressed.includes('Cats') && v.title.indexOf('for cats') !== -1, tag + ' simplified: ' + v.title);
    const read = st.catSources.filter((h) => asked.some((a) => a.indexOf(h + ':') === 0));
    check(read.length === st.catSources.length, tag + ' simplified: read the store’s collections for it, in turn: ' + JSON.stringify(asked));
    check(v.tiles.length > 0, tag + ' simplified: ' + v.tiles.length + ' products for cats');
    check(!v.tiles.some((t) => /\bDog\b|Sold out/i.test(t)), tag + ' simplified: no dog products and nothing sold out');
    check(v.tiles.some((t) => /Kitten|Cat /.test(t)), tag + ' simplified: the cat products are there');
    await page.close();

    // Simplified: an old shelf link lands on its animal and category.
    ({ page } = await openShop(browser, st.id, true, '?shelf=dog-food'));
    v = await look(page);
    check(v.title === 'Food for dogs' && v.pressed.includes('Dogs') && v.pressed.includes('Food'), tag + ' simplified: ?shelf=dog-food is Food for dogs');
    check(!v.tiles.some((t) => /Sold out/i.test(t)), tag + ' simplified: and nothing sold out');
    await page.close();

    // Simplified: search hides sold out too.
    ({ page } = await openShop(browser, st.id, true, '?q=bowl'));
    v = await look(page);
    check(v.tiles.length > 0 && !v.tiles.some((t) => /Sold out/i.test(t)) && v.brands === null, tag + ' simplified: search, nothing sold out');
    await page.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'shop display styles: FAILED' : 'shop display styles: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
