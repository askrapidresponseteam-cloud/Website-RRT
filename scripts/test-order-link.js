#!/usr/bin/env node
/**
 * The store's order number and tracking link on an RRT receipt (Orders page,
 * /shop/track).
 *
 *   1. parseOrderLink gives the answer in shared/store-order-link-cases.json
 *      for every case (the app's test/store_order_link_test.dart reads the
 *      same file).
 *   2. setOrderLink saves both on the right receipt, keeps the order of the
 *      list, marks it placed, and clears back to "sent to checkout".
 *   3. In a real browser (Chromium through Playwright), on a phone and a
 *      computer: + Add opens the form, a bad number or link says so, a good
 *      one shows both numbers and a Track order button to the link, Remove
 *      clears it, and nothing is cut off or wider than the screen.
 *
 * Run: node scripts/test-order-link.js
 * The browser part skips (exit 0) where Playwright is not installed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
const pass = (m) => console.log('ok   ' + m);
const check = (c, m) => (c ? pass(m) : fail(m));

/* ---------------------------------------------------------- 1 + 2: logic */
function load() {
  const store = {};
  const ctx = { console, setTimeout, clearTimeout, URLSearchParams, encodeURIComponent, decodeURIComponent,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } } };
  ctx.globalThis = ctx; ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'rrt-store-vendors.js'), 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'rrt-shop.js'), 'utf8'), ctx);
  return { S: ctx.RRTShop, store };
}

const cases = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'shared', 'store-order-link-cases.json'), 'utf8')).cases;
const { S, store } = load();
let bad = 0;
for (const c of cases) {
  const r = S.parseOrderLink(c.number, c.link);
  const want = c.ok ? (r.ok && r.number === c.outNumber && r.url === c.outUrl) : (!r.ok && r.error === c.error);
  if (!want) { bad++; fail('case ' + JSON.stringify(c) + ' gave ' + JSON.stringify(r)); }
}
check(bad === 0, 'all ' + cases.length + ' shared order-link cases');

function receiptFixture() {
  const line = { variant_id: 1, handle: 'pedigree', title: 'Pedigree Chicken and Liver Chunks in Gravy Adult Dog Wet Food (130g)',
    variant_title: '48x130g', qty: 1, unit_price: 295200, image: null };
  return [
    { id: 'rrt-3', lines: [line], subtotalPaise: 295200, createdAt: Date.now(), vendorOrderNumber: null, statusUrl: null,
      rrtRef: 'RRT-78TPWCSMNK', vendor: 'supertails', status: 'handed' },
    { id: 'rrt-2', lines: [line], subtotalPaise: 295200, createdAt: Date.now() - 864e5 * 3, vendorOrderNumber: null, statusUrl: null,
      rrtRef: 'RRT-2222222222', vendor: 'supertails', status: 'handed' },
    { id: 'rrt-1', lines: [line], subtotalPaise: 295200, createdAt: Date.now() - 864e5 * 9, vendorOrderNumber: null, statusUrl: null,
      rrtRef: 'RRT-1111111111', vendor: 'petslifestyle', status: 'handed' },
  ];
}
store.rrt_store_receipts_v2 = JSON.stringify(receiptFixture());
let r = S.setOrderLink('rrt-2', 'Order #104552', 'https://supertails.com/1/orders/tok');
check(r.ok, 'saves a number and a link');
let all = S.receipts();
check(all.map((o) => o.id).join() === 'rrt-3,rrt-2,rrt-1', 'the list keeps its order');
check(all[1].vendorOrderNumber === '104552' && all[1].statusUrl === 'https://supertails.com/1/orders/tok', 'both saved on that receipt');
check(all[1].status === 'placed', 'and it shows as placed');
check(all[0].vendorOrderNumber === null && all[2].vendorOrderNumber === null, 'other receipts untouched');
check(S.orderStatusUrl(all[1]) === 'https://supertails.com/1/orders/tok', 'Track order goes to the saved link');
check(S.orderStatusUrl(all[0]) === S.vendor.accountUrl, 'without a link: the store account page, as before');
r = S.setOrderLink('rrt-2', '1', '');
check(!r.ok && r.error === 'number', 'a bad number is refused');
check(S.receipts()[1].vendorOrderNumber === '104552', 'and nothing already saved is lost');
r = S.setOrderLink('rrt-2', '', '');
check(r.ok && S.receipts()[1].status === 'handed' && S.receipts()[1].vendorOrderNumber === null && S.receipts()[1].statusUrl === null,
  'clearing both goes back to sent to checkout');
check(!S.setOrderLink('rrt-nope', '1234', '').ok, 'an unknown receipt is refused');
check(S.receiptVendorName({ vendor: 'petslifestyle' }) === 'Pets Lifestyle', 'named after the store it was placed with');
check(S.receiptVendorName({ vendor: 'gone' }) === S.vendor.displayName, 'unknown store: the active one');

/* ------------------------------------------------------------ 3: browser */
function playwright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* next */ }
  }
  return null;
}
const PW = playwright();
if (!PW) { console.log('order link: logic passed; browser part skipped (Playwright not installed)'); process.exit(process.exitCode || 0); }

const PORT = 19000 + Math.floor(Math.random() * 900);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

/* Any text box clipped: its text wider or taller than the box it sits in
   (no ellipsis, no hidden overflow), or anything wider than the screen. */
const CLIPS = () => {
  const out = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page wider than the screen');
  document.querySelectorAll('.order[open] .body *, .order > summary *').forEach((el) => {
    if (!el.offsetParent || !el.textContent.trim() || el.children.length) return;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' || (cs.overflow === 'hidden' && el.scrollWidth > el.clientWidth + 1)) out.push('clipped: ' + el.textContent.trim().slice(0, 40));
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1) out.push('off screen: ' + el.textContent.trim().slice(0, 40));
  });
  return out;
};

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/'); break; } catch (e) { await new Promise((res) => setTimeout(res, 100)); }
  }
  let browser;
  try { browser = await PW.chromium.launch(); } catch (e) {
    console.log('order link: browser part skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(process.exitCode || 0);
  }
  const shots = process.env.SHOTS;
  for (const [name, vp] of [['phone', { width: 375, height: 812 }], ['desktop', { width: 1280, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (rt) => (rt.request().url().startsWith(BASE) ? rt.continue() : rt.abort()));
    await page.addInitScript((data) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('rrt_store_receipts_v2', data); sessionStorage.setItem('seeded', '1'); } },
      JSON.stringify(receiptFixture()));
    await page.goto(BASE + '/shop/track');
    await page.waitForSelector('.order');
    const first = page.locator('.order').first();
    check((await first.locator('.chip').textContent()).trim() === 'Sent to checkout', name + ': a new order says sent to checkout');
    check((await first.locator('.o-link > summary').textContent()).includes('Add Supertails order number'), name + ': + Add Supertails order number is offered');
    check(!(await first.locator('.o-link form').isVisible()), name + ': the form stays closed until asked');
    await first.locator('.o-link > summary').click();
    check(await first.locator('.o-link input[name=num]').isVisible(), name + ': + opens the form');
    // The field sits apart from its label and the button from the fields.
    const gap = await first.evaluate((el) => {
      const lab = el.querySelector('.o-link .df > span').getBoundingClientRect();
      const inp = el.querySelector('.o-link .df input').getBoundingClientRect();
      const btn = el.querySelector('.o-link .acts button').getBoundingClientRect();
      const last = el.querySelectorAll('.o-link .df input')[1].getBoundingClientRect();
      return { label: inp.top - lab.bottom, button: btn.top - last.bottom };
    });
    check(gap.label >= 6 && gap.button >= 12, name + ': label, field and button are not crowded (' + JSON.stringify(gap) + ')');
    if (shots) await page.screenshot({ path: path.join(shots, 'orderlink-' + name + '-form.png'), fullPage: true });

    await first.locator('input[name=num]').fill('1');
    await first.locator('.o-link button[type=submit]').click();
    check(await first.locator('.o-link .err').isVisible(), name + ': a bad number says so');
    check(await first.locator('.o-link .df.bad input[name=num]').count() === 1, name + ': and marks that field');

    await first.locator('input[name=num]').fill('#104552');
    await first.locator('input[name=url]').fill('Track it here: https://shiprocket.co/tracking/AWB778899.');
    await first.locator('.o-link button[type=submit]').click();
    const opened = page.locator('.order[open]');
    check(await opened.count() === 1 && (await opened.getAttribute('data-order')) === 'rrt-3', name + ': the saved order stays open');
    check((await opened.locator('.chip').textContent()).trim() === 'Placed', name + ': and now shows Placed');
    const ids = (await opened.locator('.o-ids').innerText()).replace(/\s+/g, ' ');
    check(ids.includes('RRT-78TPWCSMNK') && ids.includes('SUPERTAILS #104552'), name + ': both numbers shown (' + ids + ')');
    const btn = opened.locator('.o-meta .btn-line');
    check((await btn.textContent()).trim() === 'Track order', name + ': the button says Track order');
    check((await btn.getAttribute('href')) === 'https://shiprocket.co/tracking/AWB778899', name + ': and opens the tracking link');
    check((await opened.locator('.o-link > summary').textContent()).includes('Change Supertails order number'), name + ': + Change is offered after');
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll('.order .chip')).map((c) => {
      const r = c.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(c.firstChild);
      const lines = new Set(Array.from(range.getClientRects()).map((q) => Math.round(q.top))).size;
      const t = range.getBoundingClientRect();
      return lines === 1 && t.top >= r.top - 0.5 && t.bottom <= r.bottom + 0.5 && r.right <= innerWidth + 1;
    }));
    check(chips.length === 3 && chips.every(Boolean), name + ': every status tag on one line, inside its box');
    const helpLine = (await page.locator('#mailLink').evaluate((a) => a.parentNode.textContent)).trim();
    check(!/^\u00b7/.test(helpLine) && !/\u00b7\s*$/.test(helpLine) && !/\u00b7\s*\u00b7/.test(helpLine), name + ': help links have no stray dots (' + helpLine + ')');
    const clips = await page.evaluate(CLIPS);
    check(clips.length === 0, name + ': nothing cut off or wider than the screen ' + JSON.stringify(clips));
    await opened.locator('.o-link > summary').click();
    if (shots) await page.screenshot({ path: path.join(shots, 'orderlink-' + name + '-saved.png'), fullPage: true });

    await page.reload();
    await page.waitForSelector('.order');
    check((await page.locator('.order').first().locator('.o-ids').innerText()).includes('#104552'), name + ': kept after a reload');

    await page.locator('.order').first().locator('.o-link > summary').click();
    await page.locator('.order').first().locator('.o-link [data-rm]').click();
    const after = page.locator('.order').first();
    check((await after.locator('.chip').textContent()).trim() === 'Sent to checkout', name + ': Remove goes back to sent to checkout');
    check(!(await after.locator('.o-ids').innerText()).includes('#104552'), name + ': and the number is gone');
    check(errors.length === 0, name + ': no script errors ' + JSON.stringify(errors));
    await ctx.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'order link: FAILED' : 'order link: all passed');
  process.exit(process.exitCode || 0);
})();
