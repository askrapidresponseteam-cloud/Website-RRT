#!/usr/bin/env node
/**
 * Shop visits on the website (assets/rrt-shop-visits.js), in a real browser:
 *   - the first shop page of a visit sends "open", once, with the device and
 *     where the person came from (the homepage, a search engine, WhatsApp...);
 *   - later pages of the same visit do not; a product page sends "view";
 *   - going to the partner's checkout sends "checkout";
 *   - the same browser is the same random id; nothing personal is sent;
 *   - phones, tablets and computers, systems and browsers are told apart;
 *   - the request is plain text (no preflight) and a failure is silent.
 *
 * Run: node scripts/test-shop-visits.js
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
if (!PW) { console.log('shop visits: skipped (Playwright not installed)'); process.exit(0); }

const API = 'https://asia-south1-rrt-new-backend.cloudfunctions.net/api/store/visit';
const PORT = 19000 + Math.floor(Math.random() * 1000);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/shop'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await PW.chromium.launch(); } catch (e) { console.log('shop visits: skipped (no browser: ' + e.message.split('\n')[0] + ')'); process.exit(0); }
  const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
  const pass = (m) => console.log('ok   ' + m);
  const check = (c, m) => (c ? pass(m) : fail(m));

  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  });
  const posts = [];
  const errors = [];
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u === API) {
      posts.push({ type: r.request().headers()['content-type'], body: JSON.parse(r.request().postData() || '{}') });
      return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}', headers: { 'access-control-allow-origin': BASE } });
    }
    return u.startsWith(BASE) ? r.continue() : r.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));

  // From the homepage's Shop link (arriving with the homepage as referrer).
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', referer: BASE + '/' });
  await page.waitForTimeout(500);
  let opens = posts.filter((p) => p.body.event === 'open');
  check(opens.length === 1, 'opening the shop sends "open", once (' + opens.length + ')');
  const o = opens[0] ? opens[0].body : {};
  check(o.source === 'web' && /^[A-Za-z0-9_-]{16,64}$/.test(o.visitor || ''), 'from the website, with a random id for this browser');
  check(o.entry === 'home' && !o.from_host, 'it came from the RRT homepage');
  check(o.device && o.device.kind === 'phone' && o.device.os === 'Android' && o.device.os_version === '14' && o.device.browser === 'Chrome',
    'the device: a phone, Android 14, Chrome (' + JSON.stringify(o.device) + ')');
  check(/^text\/plain/.test(opens[0] && opens[0].type), 'sent as plain text: no preflight, survives leaving the page');
  check(Object.keys(o).sort().join(',') === 'device,entry,event,from_host,platform,source,vendor,visitor', 'nothing personal is sent (' + Object.keys(o).sort().join(',') + ')');

  // A second page of the same visit, then a product.
  await page.goto(BASE + '/shop/saved', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  check(posts.filter((p) => p.body.event === 'open').length === 1, 'another shop page of the same visit sends nothing new');
  await page.goto(BASE + '/shop/p/some-dog-food', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const views = posts.filter((p) => p.body.event === 'view');
  check(views.length === 1 && views[0].body.count === 1 && views[0].body.visitor === o.visitor, 'a product page sends "view", as the same person');

  // Checkout: every route there goes through RRTShop.startCheckout.
  await page.evaluate(() => { try { window.RRTShop.startCheckout([], {}).catch(() => {}); } catch (e) { /* no lines: fine */ } });
  await page.waitForTimeout(200);
  check(posts.some((p) => p.body.event === 'checkout'), 'going to the checkout sends "checkout"');

  // A new visit after 30 quiet minutes, from a Google search.
  await page.evaluate(() => sessionStorage.setItem('rrt_sv_at', String(Date.now() - 31 * 60 * 1000)));
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded', referer: 'https://www.google.com/' });
  await page.waitForTimeout(300);
  opens = posts.filter((p) => p.body.event === 'open');
  check(opens.length === 2 && opens[1].body.entry === 'search' && opens[1].body.from_host === 'www.google.com' && opens[1].body.visitor === o.visitor,
    'a visit 30 minutes later is a new "open", from a search engine, same person');

  // Devices, systems, browsers.
  const dev = await page.evaluate(() => {
    const d = window.RRTShopVisits.device;
    return {
      iphone: d('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', {}),
      ipad: d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', { maxTouchPoints: 5 }),
      mac: d('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15', { maxTouchPoints: 0 }),
      win: d('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0', {}),
      samsung: d('Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36', {}),
      tab: d('Mozilla/5.0 (Linux; Android 12; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', {}),
      wa: d('Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 WhatsApp', {}),
      wa2: window.RRTShopVisits.entry('https://l.facebook.com/l.php?u=x', location.host),
      wa3: window.RRTShopVisits.entry('https://web.whatsapp.com/', location.host),
    };
  });
  const s = (x) => [x.kind, x.os, x.os_version, x.browser].join('/');
  check(s(dev.iphone) === 'phone/iOS/17.4/Safari', 'iPhone Safari (' + s(dev.iphone) + ')');
  check(s(dev.ipad) === 'tablet/iPadOS//Safari', 'iPad (it says Mac, but has touch) (' + s(dev.ipad) + ')');
  check(s(dev.mac) === 'desktop/macOS//Safari', 'Mac (' + s(dev.mac) + ')');
  check(s(dev.win) === 'desktop/Windows//Edge', 'Windows Edge (' + s(dev.win) + ')');
  check(s(dev.samsung) === 'phone/Android/13/Samsung Internet', 'Samsung Internet (' + s(dev.samsung) + ')');
  check(s(dev.tab) === 'tablet/Android/12/Chrome', 'Android tablet (' + s(dev.tab) + ')');
  check(dev.wa.browser === 'In-app', 'inside WhatsApp (' + dev.wa.browser + ')');
  check(dev.wa2.entry === 'social' && dev.wa3.entry === 'social', 'links from Facebook and WhatsApp are social (' + dev.wa2.entry + ', ' + dev.wa3.entry + ')');

  // A failure to send is silent, and the shop keeps working.
  await ctx.unroute('**/*');
  await ctx.route('**/*', (r) => (r.request().url() === API ? r.abort() : (r.request().url().startsWith(BASE) ? r.continue() : r.abort())));
  await page.evaluate(() => sessionStorage.removeItem('rrt_sv_at'));
  await page.goto(BASE + '/shop', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  check(errors.length === 0, 'no script errors, even when counting fails ' + JSON.stringify(errors.slice(0, 3)));

  await browser.close();
  console.log(process.exitCode ? 'shop visits: FAILED' : 'shop visits: all passed');
  process.exit(process.exitCode || 0);
})();
