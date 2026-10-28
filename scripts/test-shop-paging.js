#!/usr/bin/env node
/**
 * The real /shop page in a real browser (Chromium through Playwright), the
 * partner store answered by stubs that take a moment like a real one:
 *   - the next page is read ahead as soon as one lands;
 *   - scrolling at a thumb's pace never waits at the bottom for a page;
 *   - new tiles are added below; the ones on screen are never redrawn;
 *   - everything the store lists is shown: sold-out items (as sold out) and
 *     items the store tags to hide on its own site;
 *   - no "Load more" button while pages come as you scroll ("Loading more");
 *   - back from a product: the same list at the same place, nothing read again
 *     from the start; a fresh visit starts at the top;
 *   - a later page that fails keeps what is on screen and offers to try again.
 *
 * Run: node scripts/test-shop-paging.js
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
if (!PW) { console.log('shop paging: skipped (Playwright not installed)'); process.exit(0); }
const { chromium } = PW;

const PAGES = 5, SIZE = 24;
/* The landing reads the store's "all" feed (24 a page, through /st-api),
 * as the app does. Page 1 carries Rs 0.01, Rs 1 and Rs 10 listings (Vivaldis'
 * were missing in 2.23.2), a sold-out one and one the store tags st-hide. */
function feedItem(p, i) {
  const id = p * 100 + i;
  const price = p === 1 && i === 2 ? '0.01' : (p === 1 && i === 3 ? '1.00' : (p === 1 && i === 4 ? '10.00' : '100.00'));
  return { id, handle: 'p' + id, title: 'Product ' + id, vendor: i === 3 || i === 4 ? 'Vivaldis' : 'Brand',
    product_type: 'Dog Food', tags: i === 7 ? ['st-hide'] : ['Veg'], images: [],
    options: [{ name: 'Title', position: 1, values: ['Default Title'] }],
    variants: [{ id: id * 10, title: 'Default Title', option1: 'Default Title', price, available: i !== 5 }] };
}
function node(p, i) {
  const id = p * 100 + i;
  return { id: 'gid://shopify/Product/' + id, handle: 'p' + id, title: 'Product ' + id, vendor: 'Brand',
    productType: 'Dog Food', availableForSale: !(i === 5), publishedAt: '2026-01-01T00:00:00Z', featuredImage: null,
    tags: i === 7 ? ['st-hide'] : ['Veg'],
    priceRange: { minVariantPrice: { amount: '100.0' }, maxVariantPrice: { amount: '100.0' } },
    compareAtPriceRange: { maxVariantPrice: { amount: '0' } } };
}
const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)],
  { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/shop'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await chromium.launch(); } catch (e) {
    console.log('shop paging: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const calls = []; let failPage = 0;
  const apiCalls = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith(BASE + '/st-api/collections/all/products.json')) {
      const p = Number(new URL(url).searchParams.get('page') || '1');
      calls.push({ p, t: Date.now() });
      await new Promise((r) => setTimeout(r, 300)); // a real store takes a moment
      if (p === failPage) return route.fulfill({ status: 503, body: 'down' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        products: p <= PAGES ? Array.from({ length: SIZE }, (_, i) => feedItem(p, i)) : [] }) });
    }
    if (url.startsWith(BASE)) return route.continue();
    if (url.includes('/graphql.json')) {
      apiCalls.push(url);
      const body = JSON.parse(route.request().postData() || '{}');
      const after = body.variables && body.variables.after;
      const p = after ? Number(String(after).slice(1)) : 1;
      calls.push({ q: (body.query || '').slice(0, 20), p, t: Date.now() });
      await new Promise((r) => setTimeout(r, 300)); // a real store takes a moment
      if (p === failPage) return route.fulfill({ status: 503, body: 'down' });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { products: {
        pageInfo: { hasNextPage: p < PAGES, endCursor: 'c' + (p + 1) },
        nodes: Array.from({ length: SIZE }, (_, i) => node(p, i)) } } }) });
    }
    return route.abort();
  });
  const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
  const pass = (m) => console.log('ok   ' + m);
  const tiles = () => page.evaluate(() => document.querySelectorAll('#grid > :not(.skel-tile)').length);
  page.on('pageerror', (e) => fail('page error: ' + e.message));

  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(1200);
  const n1 = await tiles();
  // Every product of the page, sold out and store-hidden ones included.
  (n1 % SIZE === 0 && n1 >= SIZE) ? pass('first page drawn: ' + n1 + ' tiles (sold-out and st-hide included)') : fail('first page tiles ' + n1);
  const before = calls.map((c) => c.p);
  before.includes(2) ? pass('page 2 read ahead before any scroll: ' + JSON.stringify(before)) : fail('no read-ahead: ' + JSON.stringify(before));
  const prices = await page.evaluate(() => document.getElementById('grid').textContent);
  (/₹0\.01/.test(prices) && /₹1(?![0-9.])/.test(prices) && /₹10(?![0-9])/.test(prices))
    ? pass('the Rs 0.01, Rs 1 and Rs 10 listings are on the landing') : fail('Rs 0.01 / Rs 1 / Rs 10 listings missing');
  apiCalls.length === 0 ? pass('the landing read the store\'s "all" feed, not the API') : fail('API used: ' + apiCalls.length);
  const hidden = await page.evaluate(() => !!document.querySelector('a[href*="p107"]'));
  hidden ? pass('a product the store tags st-hide is listed') : fail('st-hide product missing');
  const soldOut = await page.evaluate(() => {
    const tile = Array.prototype.find.call(document.querySelectorAll('#grid > *'), (el) => el.innerHTML.indexOf('/p105') !== -1);
    return tile ? tile.textContent : '';
  });
  /Sold out/.test(soldOut) ? pass('a sold-out product is listed, marked sold out') : fail('sold-out tile: ' + soldOut.slice(0, 80));

  await page.evaluate(() => { const t = document.querySelector('#grid > :not(.skel-tile)'); t.dataset.mark = 'first'; });
  // Scroll steadily like a thumb; never jump to the very bottom.
  let waitedAtBottom = 0, buttonShown = 0, loadingShown = 0;
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(60);
    const foot = await page.evaluate(() => ({ button: !document.getElementById('more').hidden,
      loading: !document.getElementById('loadingMore').hidden }));
    if (foot.button) buttonShown++;
    if (foot.loading) loadingShown++;
    const atBottom = await page.evaluate(() => {
      const f = document.getElementById('foot'); const busy = document.getElementById('grid').getAttribute('aria-busy') === 'true';
      return f && !f.hidden && f.getBoundingClientRect().top < innerHeight && busy;
    });
    if (atBottom) waitedAtBottom++;
    const done = await page.evaluate(() => !document.getElementById('done').hidden);
    if (done) break;
  }
  const nAll = await tiles();
  nAll === SIZE * PAGES ? pass('every page loaded while scrolling: ' + nAll + ' tiles') : fail('tiles after scrolling ' + nAll);
  waitedAtBottom === 0 ? pass('never waited at the bottom for a page') : fail('waited at the bottom ' + waitedAtBottom + ' times');
  const kept = await page.evaluate(() => !!document.querySelector('[data-mark="first"]'));
  kept ? pass('tiles already on screen were kept (appended, not redrawn)') : fail('grid was redrawn');
  const per = {}; calls.forEach((c) => { per[c.p] = (per[c.p] || 0) + 1; });
  Object.values(per).every((v) => v === 1) ? pass('each page asked for once: ' + JSON.stringify(per)) : fail('repeat reads ' + JSON.stringify(per));
  buttonShown === 0 ? pass('no "Load more" button while scrolling') : fail('"Load more" shown ' + buttonShown + ' times');
  loadingShown > 0 ? pass('"Loading more" shown instead (' + loadingShown + ' looks)') : fail('no loading sign at the bottom');

  // Back from a product: the same list, at the same place.
  await page.evaluate(() => window.scrollTo(0, 2600));
  await page.waitForTimeout(300);
  const at = await page.evaluate(() => {
    const y = window.scrollY;
    const link = Array.prototype.find.call(document.querySelectorAll('#grid a[href^="/shop/p/"]'), (a) => a.getBoundingClientRect().top > 80);
    window.__wasHere = 1;
    return { y, href: link.getAttribute('href'), n: document.querySelectorAll('#grid > :not(.skel-tile)').length };
  });
  calls.length = 0;
  await page.evaluate((h) => document.querySelector('#grid a[href="' + h + '"]').click(), at.href); // a tap where it is (no scrolling to it first)
  await page.waitForURL('**' + at.href, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => ({ y: window.scrollY, n: document.querySelectorAll('#grid > :not(.skel-tile)').length,
    fresh: !window.__wasHere, done: !document.getElementById('done').hidden }));
  (back.n === at.n && Math.abs(back.y - at.y) <= 30)
    ? pass('back from a product: the same ' + back.n + ' products, at the same place (' + back.y + ' of ' + at.y + ')' + (back.fresh ? '' : ' [the browser kept the page]'))
    : fail('after back: ' + JSON.stringify(back) + ' wanted ' + JSON.stringify(at));
  !calls.some((c) => c.p === 1) ? pass('nothing read again from the start') : fail('read again: ' + JSON.stringify(calls.map((c) => c.p)));
  back.done ? pass('and it still knows it has everything') : fail('the end of the list was forgotten');
  // A fresh visit starts at the top.
  calls.length = 0;
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(400);
  const fresh = await page.evaluate(() => ({ y: window.scrollY, n: document.querySelectorAll('#grid > :not(.skel-tile)').length }));
  (fresh.y === 0 && fresh.n === SIZE) ? pass('a fresh visit starts at the top, with the first page') : fail('fresh visit: ' + JSON.stringify(fresh));

  // Back part-way down a listing that has more: it carries on paging from there.
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(250); }
  await page.waitForTimeout(800);
  const mid = await page.evaluate(() => { const anchor = () => { const t = Array.prototype.find.call(document.querySelectorAll('#grid > :not(.skel-tile)'), (el) => el.getBoundingClientRect().bottom > 120); const a = t && t.querySelector('a[href^="/shop/p/"]'); return t ? { href: a ? a.getAttribute('href') : '', top: Math.round(t.getBoundingClientRect().top) } : null; }; return { y: window.scrollY, at: anchor(), n: document.querySelectorAll('#grid > :not(.skel-tile)').length,
    href: Array.prototype.find.call(document.querySelectorAll('#grid a[href^="/shop/p/"]'), (a) => a.getBoundingClientRect().top > 80).getAttribute('href') }; });
  await page.evaluate((h) => document.querySelector('#grid a[href="' + h + '"]').click(), mid.href);
  await page.waitForURL('**' + mid.href, { timeout: 10000 });
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(600);
  const midBack = await page.evaluate(() => { const anchor = () => { const t = Array.prototype.find.call(document.querySelectorAll('#grid > :not(.skel-tile)'), (el) => el.getBoundingClientRect().bottom > 120); const a = t && t.querySelector('a[href^="/shop/p/"]'); return t ? { href: a ? a.getAttribute('href') : '', top: Math.round(t.getBoundingClientRect().top) } : null; }; return { y: window.scrollY, at: anchor(), n: document.querySelectorAll('#grid > :not(.skel-tile)').length }; });
  // The same products in the same place on screen (the page above them may settle a little).
  (midBack.n >= mid.n && midBack.at && mid.at && midBack.at.href === mid.at.href && Math.abs(midBack.at.top - mid.at.top) <= 30 && mid.n < SIZE * PAGES)
    ? pass('back part-way down: ' + midBack.n + ' products at the same place (' + midBack.y + ')') : fail('part-way back: ' + JSON.stringify([mid, midBack]));
  for (let i = 0; i < 80; i++) {
    await page.mouse.wheel(0, 500); await page.waitForTimeout(60);
    if (await page.evaluate(() => !document.getElementById('done').hidden)) break;
  }
  (await tiles()) === SIZE * PAGES ? pass('and scrolling on reads the rest') : fail('after coming back, scrolling on: ' + (await tiles()));

  // A later page that fails keeps what is on screen.
  failPage = 3; calls.length = 0;
  await page.evaluate(() => { try { sessionStorage.clear(); } catch (e) {} });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#grid > :not(.skel-tile)').length > 0, null, { timeout: 15000 });
  for (let i = 0; i < 40; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(60); }
  await page.waitForTimeout(1500);
  const state = await page.evaluate(() => ({ tiles: document.querySelectorAll('#grid > :not(.skel-tile)').length,
    more: document.getElementById('more').textContent, moreHidden: document.getElementById('more').hidden,
    stateShown: !document.getElementById('state').hidden }));
  (state.tiles === 2 * SIZE && !state.stateShown && /Try again/.test(state.more) && !state.moreHidden)
    ? pass('page 3 failing keeps pages 1-2 on screen and offers to try again')
    : fail('after a failed page: ' + JSON.stringify(state));
  failPage = 0;
  await page.click('#more');
  await page.waitForTimeout(1200);
  const after = await tiles();
  after > 2 * SIZE ? pass('pressing it loads on: ' + after + ' tiles') : fail('retry did not load: ' + after);
  await browser.close();
  console.log(process.exitCode ? 'shop paging: FAILED' : 'shop paging: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
