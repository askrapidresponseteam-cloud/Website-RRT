#!/usr/bin/env node
/**
 * The Filters display (flags.store_filters) on the real /shop page in a real
 * browser, for each kind of partner store, every store answered by stubs:
 *   Supertails    Shopify Online Store: its own filters from the Storefront
 *                 API (Pet Type, Brand, Price), applied by the store;
 *   Paws & Tails  Shopify behind its own front end: the same, on its site;
 *   JustDogs      WooCommerce: its attributes and counts from the Store API
 *                 (collection-data), applied by the store.
 * And on every store's landing (the whole catalogue has no store filters):
 * the basic set worked out from what is listed.
 *
 * Checks: the Filters button and panel, counts, a choice reaches the store
 * the way it applies it, the grid then shows only what matches, the choice
 * is a chip and is in the URL, removing it brings everything back, "In
 * stock only", sold out still shown and marked otherwise, every sort, and
 * no Filters button in the current display.
 *
 * Run: node scripts/test-shop-filters.js
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
if (!PW) { console.log('shop filters: skipped (Playwright not installed)'); process.exit(0); }
const { chromium } = PW;

/* Every listing: ten products, the first sold out; odd ones for dogs by
 * brand Drools, even ones for cats by brand Whiskas. */
function catalogue(h) {
  return Array.from({ length: 10 }, (_, i) => ({
    id: 1000 + i + (h === 'all' ? 0 : 100), handle: h.replace(/[^a-z0-9]+/g, '-') + '-' + i,
    title: (i % 2 ? 'Dog ' : 'Cat ') + 'thing ' + i, brand: i % 2 ? 'Drools' : 'Whiskas', soldOut: i === 0,
    dog: i % 2 === 1, price: 100 + i * 50,
  }));
}
const DOG_INPUT = JSON.stringify({ productMetafield: { namespace: 'custom', key: 'pet_type', value: 'Dogs' } });
const CAT_INPUT = JSON.stringify({ productMetafield: { namespace: 'custom', key: 'pet_type', value: 'Cats' } });
function shopifyFilters(list) {
  const dogs = list.filter((p) => p.dog).length, cats = list.length - dogs;
  return [
    { id: 'filter.p.m.custom.pet_type', label: 'Pet Type', type: 'LIST', values: [
      { id: 'filter.p.m.custom.pet_type.dogs', label: 'Dogs', count: dogs, input: DOG_INPUT },
      { id: 'filter.p.m.custom.pet_type.cats', label: 'Cats', count: cats, input: CAT_INPUT }] },
    { id: 'filter.p.vendor', label: 'Brand', type: 'LIST', values: [
      { id: 'filter.p.vendor.drools', label: 'Drools', count: dogs, input: JSON.stringify({ productVendor: 'Drools' }) },
      { id: 'filter.p.vendor.whiskas', label: 'Whiskas', count: cats, input: JSON.stringify({ productVendor: 'Whiskas' }) }] },
    { id: 'filter.v.price', label: 'Price', type: 'PRICE_RANGE', values: [
      { id: 'filter.v.price', label: 'Price', count: 0, input: JSON.stringify({ price: { min: 0, max: 600 } }) }] },
  ];
}
function shopifyApply(list, filters) {
  let out = list;
  for (const f of filters || []) {
    if (f.productMetafield) out = out.filter((p) => (f.productMetafield.value === 'Dogs') === p.dog);
    if (f.productVendor) out = out.filter((p) => p.brand === f.productVendor);
    if (f.price) out = out.filter((p) => (f.price.min == null || p.price >= f.price.min) && (f.price.max == null || p.price <= f.price.max));
  }
  return out;
}
function gqlNode(p) {
  return { id: 'gid://shopify/Product/' + p.id, handle: p.handle, title: p.title, vendor: p.brand, productType: '',
    availableForSale: !p.soldOut, publishedAt: '2026-01-01T00:00:00Z', featuredImage: null, tags: [],
    priceRange: { minVariantPrice: { amount: String(p.price) + '.0' }, maxVariantPrice: { amount: String(p.price) + '.0' } },
    compareAtPriceRange: { maxVariantPrice: { amount: '0' } } };
}
function feedJson(list) {
  return { products: list.map((p) => ({ id: p.id, handle: p.handle, title: p.title, vendor: p.brand, product_type: '', tags: [], images: [],
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    variants: [{ id: p.id * 10, title: 'Default Title', option1: 'Default Title', price: String(p.price) + '.00', available: !p.soldOut }] })) };
}
function wooJson(p) {
  return { id: p.id, name: p.title, slug: p.handle, type: 'simple', parent: 0, description: '', short_description: '',
    prices: { price: String(p.price), regular_price: String(p.price), sale_price: String(p.price), price_range: null, currency_code: 'INR', currency_minor_unit: 0 },
    images: [], categories: [], tags: [], attributes: [{ name: 'Brand', taxonomy: 'pa_brand', has_variations: false, terms: [{ name: p.brand }] }],
    variations: [], is_purchasable: true, is_in_stock: !p.soldOut, add_to_cart: { url: '?add-to-cart=' + p.id, maximum: 9999 } };
}
const WOO_TERM = { Drools: 77, Whiskas: 78 };

const PORT = 20000 + Math.floor(Math.random() * 900);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)],
  { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
const pass = (m) => console.log('ok   ' + m);
let lastLook = null;
const check = (c, m) => (c ? pass(m) : fail(m + (lastLook ? '\n       ' + JSON.stringify(lastLook).slice(0, 700) : '')));

async function openShop(browser, store, style, query, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1280, height: 900 } });
  const asked = [];
  page.on('pageerror', (e) => fail(store + ': page error: ' + e.message));
  await page.addInitScript(([id, st]) => {
    window.RRT_SHOP_VENDOR = id;
    try {
      localStorage.setItem('rrt_store_simple', st === 'simple' ? 'true' : 'false');
      localStorage.setItem('rrt_store_filters', st === 'filters' ? 'true' : 'false');
    } catch (e) { /* none */ }
  }, [store, style]);
  await page.route('**/*', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const json = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (/\/assets\/vendor\/firebase-/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
    let m = /^\/[a-z]+-api\/collections\/([^/]+)\/products\.json$/.exec(url.pathname);
    if (req.url().startsWith(BASE) && m) {
      const p = Number(url.searchParams.get('page') || '1');
      asked.push({ kind: 'feed', h: m[1], p });
      return json(feedJson(p === 1 ? catalogue(decodeURIComponent(m[1])) : []));
    }
    if (/\/api\/\d{4}-\d{2}\/graphql\.json$/.test(url.pathname)) {
      const body = JSON.parse(req.postData() || '{}');
      const v = body.variables || {}; const q = String(body.query || '');
      if (/RrtFiltered/.test(q)) {
        asked.push({ kind: 'filtered', h: v.handle, filters: v.filters || [] });
        const list = shopifyApply(catalogue(v.handle), v.filters);
        return json({ data: { collection: { products: { filters: shopifyFilters(list),
          pageInfo: { hasNextPage: false, endCursor: 'c2' }, nodes: list.map(gqlNode) } } } });
      }
      const h = /collection\(handle/.test(q) ? v.handle : 'all';
      asked.push({ kind: 'gql', h });
      const conn = { pageInfo: { hasNextPage: false, endCursor: 'c2' }, nodes: catalogue(h).map(gqlNode) };
      if (/search\(/.test(q)) return json({ data: { search: Object.assign({ totalCount: 10 }, conn) } });
      if (h === 'all') return json({ data: { products: conn } });
      return json({ data: { collection: { products: conn } } });
    }
    const wp = /^\/[a-z]+-api\/wp-json\/wc\/store\/v1(\/.*)$/.exec(url.pathname);
    if (req.url().startsWith(BASE) && wp) {
      const ep = wp[1];
      const sp = url.searchParams;
      if (ep === '/products/attributes') return json([{ id: 5, name: 'Brand', taxonomy: 'pa_brand', has_archives: false }]);
      if (ep === '/products/attributes/5/terms') return json([{ id: 77, name: 'Drools', slug: 'drools', count: 5 }, { id: 78, name: 'Whiskas', slug: 'whiskas', count: 5 }, { id: 79, name: 'Unsold', slug: 'unsold', count: 0 }]);
      const terms = []; for (const [k, val] of sp.entries()) if (/^attributes\[0\]\[term_id\]/.test(k)) terms.push(Number(val));
      const h = sp.get('category') || 'all';
      let list = catalogue(h);
      if (terms.length) list = list.filter((p) => terms.includes(WOO_TERM[p.brand]));
      if (sp.get('stock_status[0]') === 'instock') list = list.filter((p) => !p.soldOut);
      if (sp.get('min_price')) list = list.filter((p) => p.price >= Number(sp.get('min_price')));
      if (sp.get('max_price')) list = list.filter((p) => p.price <= Number(sp.get('max_price')));
      if (ep === '/products/collection-data') {
        asked.push({ kind: 'woo-counts', h, terms, q: url.search });
        const counts = {}; list.forEach((p) => { counts[WOO_TERM[p.brand]] = (counts[WOO_TERM[p.brand]] || 0) + 1; });
        return json({ price_range: { min_price: '100', max_price: '550', currency_minor_unit: 0 },
          attribute_counts: Object.keys(counts).map((t) => ({ term: Number(t), count: counts[t] })),
          stock_status_counts: [{ status: 'instock', count: list.length }] });
      }
      if (ep === '/products') {
        const p = Number(sp.get('page') || '1');
        asked.push({ kind: 'woo', h, terms, p, q: url.search });
        return json(p === 1 ? list.map(wooJson) : []);
      }
      if (ep === '/products/categories') return json([]);
    }
    if (req.url().startsWith(BASE)) return route.continue();
    return route.abort();
  });
  await page.goto(BASE + '/shop' + (query || ''), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0 ||
    !document.getElementById('state').hidden, null, { timeout: 15000 });
  await page.waitForTimeout(700);
  return { page, asked };
}

async function look(page) {
  lastLook = await page.evaluate(() => {
    const tiles = Array.prototype.filter.call(document.querySelectorAll('#grid > *'), (el) => !el.classList.contains('skel-tile'));
    const fp = document.querySelector('dialog.fp');
    return {
      tiles: tiles.map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      button: !document.getElementById('filtersBtn').hidden,
      chosen: document.getElementById('filtersN').hidden ? 0 : Number(document.getElementById('filtersN').textContent),
      chips: Array.prototype.map.call(document.querySelectorAll('#activeFilters button'), (b) => b.textContent.replace(/\s+/g, ' ').trim()),
      sorts: Array.prototype.map.call(document.querySelectorAll('#sort option'), (o) => o.value),
      panel: fp && fp.open ? {
        sections: Array.prototype.map.call(fp.querySelectorAll('.fp-h'), (h) => h.textContent.replace(/[+-]$/, '').trim()),
        values: Array.prototype.map.call(fp.querySelectorAll('.fp-v'), (v) => v.textContent.replace(/\s+/g, ' ').trim()),
        price: !!fp.querySelector('input[name=pmin]')
      } : null,
      url: location.search,
      state: document.getElementById('state').hidden ? '' : document.getElementById('state').textContent.trim()
    };
  });
  return lastLook;
}
async function openPanel(page) {
  await page.click('#filtersBtn');
  await page.waitForSelector('dialog.fp[open]');
  return look(page);
}
async function tick(page, label) {
  await page.evaluate((l) => {
    const v = Array.prototype.find.call(document.querySelectorAll('dialog.fp .fp-v'), (x) => x.textContent.trim().indexOf(l) === 0);
    if (!v) throw new Error('no choice ' + l);
    const h = v.closest('.fp-vals'); if (h.hidden) h.previousElementSibling.click();
    v.querySelector('input').click();
  }, label);
}
async function show(page) {
  await page.click('dialog.fp .fp-apply');
  await page.waitForTimeout(900);
  return look(page);
}

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/shop'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await chromium.launch(); } catch (e) {
    console.log('shop filters: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }

  const STORES = [
    { id: 'supertails', kind: 'Shopify', shelf: '?shelf=pharmacy', aisle: 'pet-pharmacy' },
    { id: 'pawsandtails', kind: 'Shopify headless', shelf: '?shelf=pharmacy', aisle: 'pharmacy' },
    { id: 'justdogs', kind: 'WooCommerce', shelf: '?shelf=pharmacy', aisle: 'pharmacy' },
  ];
  for (const st of STORES) {
    const tag = st.id + ' (' + st.kind + ')';

    // The current display has no Filters button.
    let { page } = await openShop(browser, st.id, 'current', st.shelf);
    let v = await look(page);
    check(!v.button && v.chips.length === 0, tag + ' current: no Filters button');
    await page.close();

    // A shelf: the store's own filters.
    let asked;
    ({ page, asked } = await openShop(browser, st.id, 'filters', st.shelf));
    v = await look(page);
    check(v.button && v.sorts.join() === 'featured,newest,priceLow,priceHigh', tag + ' filters: the button, and every sort');
    check(v.tiles.some((t) => /Sold out/i.test(t)), tag + ' filters: sold out still shown, marked');
    v = await openPanel(page);
    if (process.env.SHOTS) { await page.waitForTimeout(400); await page.screenshot({ path: path.join(process.env.SHOTS, st.id + '-filters-panel.png') }); }
    const want = st.id === 'justdogs' ? ['Brand', 'Price'] : ['Pet Type', 'Brand', 'Price'];
    check(v.panel && want.every((s) => v.panel.sections.includes(s)) && v.panel.price, tag + ' filters: the store’s own filters ' + JSON.stringify(v.panel && v.panel.sections));
    check(v.panel.values.some((x) => /^Drools\s*5$/.test(x)), tag + ' filters: with the store’s counts');
    check(!v.panel.values.some((x) => /Unsold/.test(x)), tag + ' filters: a choice with nothing in it is not offered');
    await tick(page, 'Drools');
    v = await show(page);
    const last = asked.filter((a) => a.kind === (st.id === 'justdogs' ? 'woo' : 'filtered')).pop();
    const reached = st.id === 'justdogs' ? (last && last.terms.join() === '77') : (last && JSON.stringify(last.filters) === JSON.stringify([{ productVendor: 'Drools' }]));
    check(reached, tag + ' filters: the choice reaches the store the way it applies it ' + JSON.stringify(last));
    check(v.tiles.length > 0 && v.tiles.every((t) => /Dog thing/.test(t)), tag + ' filters: only what matches (' + v.tiles.length + ')');
    check(v.chips.some((c) => /^Drools/.test(c)) && v.chosen === 1 && /[?&]f=/.test(v.url), tag + ' filters: a chip, the count on the button, the URL');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, st.id + '-filters-chosen.png') });
    // Kept on reload (the URL carries it).
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(900);
    v = await look(page);
    check(v.chips.some((c) => /^Drools/.test(c)) && v.tiles.every((t) => /Dog thing/.test(t)), tag + ' filters: kept on reload');
    // In stock only.
    v = await openPanel(page);
    await page.click('dialog.fp input[name=stock]');
    v = await show(page);
    check(v.tiles.length > 0 && !v.tiles.some((t) => /Sold out/i.test(t)) && v.chips.some((c) => /In stock only/.test(c)), tag + ' filters: in stock only');
    // Remove both: everything again.
    await page.click('#activeFilters button.clear');
    await page.waitForTimeout(900);
    v = await look(page);
    check(v.chips.length === 0 && v.tiles.length === 10 && !/[?&]f=/.test(v.url), tag + ' filters: clear all brings everything back');
    // Price.
    v = await openPanel(page);
    await page.evaluate(() => { const i = document.querySelector('dialog.fp input[name=pmax]'); const box = i.closest('.fp-vals'); if (box.hidden) box.previousElementSibling.click(); });
    await page.fill('dialog.fp input[name=pmax]', '300');
    v = await show(page);
    check(v.tiles.length > 0 && v.tiles.length < 10 && v.chips.some((c) => /Up to/.test(c)), tag + ' filters: price ' + v.tiles.length);
    await page.close();

    // The landing: the basic set, from what is listed.
    ({ page } = await openShop(browser, st.id, 'filters', ''));
    v = await openPanel(page);
    const basic = st.id === 'justdogs' ? ['Brand', 'Price'] : ['Pet type', 'Brand', 'Price'];
    check(v.panel && basic.every((s) => v.panel.sections.includes(s)), tag + ' landing: filters ' + JSON.stringify(v.panel && v.panel.sections));
    if (st.id !== 'justdogs') {
      await tick(page, 'Cats');
      v = await show(page);
      check(v.tiles.length > 0 && v.tiles.every((t) => /Cat thing/.test(t)) && v.chips.some((c) => /^Cats/.test(c)), tag + ' landing: pet type, applied here');
    }
    await page.close();
  }
  // On a phone: the panel is a bottom sheet with Show products in reach.
  {
    const { page } = await openShop(browser, 'supertails', 'filters', '?shelf=pharmacy', { width: 390, height: 844 });
    await openPanel(page);
    await page.waitForTimeout(500); // the sheet slides up
    const box = await page.evaluate(() => {
      const r = document.querySelector('dialog.fp').getBoundingClientRect();
      const b = document.querySelector('dialog.fp .fp-apply').getBoundingClientRect();
      return { left: r.left, width: r.width, bottom: r.bottom, applyBottom: b.bottom, h: innerHeight, w: innerWidth };
    });
    check(box.left === 0 && Math.abs(box.width - box.w) < 2 && Math.abs(box.bottom - box.h) < 2 && box.applyBottom <= box.h,
      'phone: the panel is a bottom sheet, Show products in reach ' + JSON.stringify(box));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'phone-filters-panel.png') });
    await page.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'shop filters: FAILED' : 'shop filters: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
