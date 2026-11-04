#!/usr/bin/env node
/**
 * The product page shows each photo whole (/shop/p/{handle}), in a real
 * browser (Chromium through Playwright), the partner store answered by stubs.
 *
 * Once the big photo was zoomed in (and nudged up) to hide the white around
 * packshots, which cut off the top and the edges of any photo that fills its
 * frame, like a dog wearing the product. Now:
 *   - the big photo, square, tall or wide, is drawn whole inside its frame
 *     (never zoomed, never moved), on a phone and on a computer;
 *   - so is every thumbnail under it, and a thumbnail shows its photo whole
 *     up top when picked.
 *
 * Run: node scripts/test-product-photo.js
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
if (!PW) { console.log('product photo: skipped (Playwright not installed)'); process.exit(0); }

// Photos that fill their frame to the edge (a red band all round), in three shapes.
const SHAPES = { square: [1000, 1000], tall: [800, 1200], wide: [1200, 800] };
function photo(name) {
  const [w, h] = SHAPES[name] || SHAPES.square;
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#d81e2c"/>' +
    '<rect x="40" y="40" width="' + (w - 80) + '" height="' + (h - 80) + '" fill="#8fb7d9"/></svg>';
}
const IMAGES = Object.keys(SHAPES).map((s) => '//cdn.shopify.com/s/files/test/' + s + '.jpg');
const PRODUCT = {
  id: 9001, title: 'Linen Heart Embroidered Kurta for Dogs (Baby Blue)', handle: 'linen-heart-kurta', description: '<p>Soft linen.</p>',
  vendor: '15 Furries Dropship', type: 'Apparel', tags: [], available: true, price: 99900,
  images: IMAGES, featured_image: IMAGES[0],
  options: [{ name: 'Size', values: ['XS', 'S', 'M'] }],
  variants: ['XS', 'S', 'M'].map((s, i) => ({ id: 90010 + i, title: s, price: 99900, compare_at_price: 199800, available: true,
    option1: s, options: [s], featured_image: null })),
};

const PORT = 19000 + Math.floor(Math.random() * 900);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
const pass = (m) => console.log('ok   ' + m);
const check = (c, m) => (c ? pass(m) : fail(m));

/* Where an <img> really draws its photo (object-fit: contain, any CSS
   transform included), and the frame that clips it. */
const MEASURE = (img) => {
  const r = img.getBoundingClientRect();
  const frame = img.parentElement.getBoundingClientRect();
  const cs = getComputedStyle(img);
  const pad = ['Left', 'Right', 'Top', 'Bottom'].map((k) => parseFloat(cs['padding' + k]) || 0);
  const bw = r.width - pad[0] - pad[1], bh = r.height - pad[2] - pad[3];
  const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
  const s = cs.objectFit === 'contain' ? Math.min(bw / nw, bh / nh) : Math.max(bw / nw, bh / nh);
  const dw = nw * s, dh = nh * s;
  const x = r.left + pad[0] + (bw - dw) / 2, y = r.top + pad[2] + (bh - dh) / 2;
  const fb = parseFloat(getComputedStyle(img.parentElement).borderLeftWidth) || 0;
  const inside = x >= frame.left - 0.5 && y >= frame.top - 0.5 && x + dw <= frame.right + 0.5 && y + dh <= frame.bottom + 0.5;
  return { inside, loaded: img.complete && img.naturalWidth > 0, transform: cs.transform, fit: cs.objectFit,
    fills: Math.max(dw / (frame.width - 2 * fb), dh / (frame.height - 2 * fb)) };
};

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await PW.chromium.launch(); } catch (e) {
    console.log('product photo: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }
  for (const [name, viewport] of [['computer', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => { window.RRT_SHOP_VENDOR = 'supertails'; });
    await page.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (u.hostname === 'cdn.shopify.com') {
        const s = (/\/test\/([a-z]+)\.jpg$/.exec(u.pathname) || [])[1];
        return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: photo(s) });
      }
      if (route.request().url().startsWith(BASE) && /^\/[a-z]+-api\/products\/[^/]+\.js$/.test(u.pathname)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PRODUCT) });
      }
      if (/\/assets\/vendor\/firebase-/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
      if (route.request().url().startsWith(BASE)) return route.continue();
      return route.abort();
    });
    await page.goto(BASE + '/shop/p/' + PRODUCT.handle, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const i = document.getElementById('shot'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 });
    await page.waitForTimeout(300);
    for (let i = 0; i < IMAGES.length; i++) {
      const shape = Object.keys(SHAPES)[i];
      if (i) {
        await page.click('#thumbs button[data-i="' + i + '"]');
        await page.waitForFunction((n) => { const im = document.getElementById('shot'); return im.complete && im.naturalWidth > 0 && im.src.indexOf('/' + n + '.jpg') !== -1; }, shape, { timeout: 8000 });
      }
      const m = await page.$eval('#shot', MEASURE);
      check(m.loaded && m.inside && m.transform === 'none' && m.fit === 'contain',
        name + ': the ' + shape + ' photo is shown whole, not zoomed or moved (' + JSON.stringify(m) + ')');
      check(m.fills > 0.97, name + ': and fills its frame edge to edge the long way (' + m.fills.toFixed(3) + ')');
    }
    const thumbs = await page.$$eval('#thumbs img', (ims, src) => ims.map(new Function('return ' + src)()), MEASURE.toString());
    check(thumbs.length === IMAGES.length && thumbs.every((t) => t.inside && t.transform === 'none'),
      name + ': every thumbnail is shown whole (' + thumbs.map((t) => t.inside).join(',') + ')');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'product-photo-' + name + '.png') });
    check(errors.length === 0, name + ': no script errors' + (errors.length ? ': ' + errors.join('; ') : ''));
    await page.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'product photo: FAILED' : 'product photo: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
