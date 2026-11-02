#!/usr/bin/env node
/**
 * The network page (/network) and the homepage's line about it, in a real
 * browser, fed by the backend's own answer (backend/functions/public_network.js
 * view()), so what is tested is what ships:
 *   - all of India first: people, districts, states, when it was counted;
 *   - districts largest first, three at a time, a search, a district picked
 *     and back to all of India; "+" where a figure is rounded;
 *   - the map: India's districts from the app's own boundaries (every
 *     district key the app and backend use is on it), a red dot per person
 *     inside their district, the district picked highlighted and zoomed to,
 *     a district picked by clicking it; no map server is asked for anything;
 *   - Hindi; a phone (a picker beside the map instead of the list);
 *   - a failed load says so and can be tried again; an empty network;
 *   - today's line asking people to join: a different one on every visit,
 *     every number in it true, a Join today button to this phone's store;
 *   - West (a district in Delhi and in Sikkim) drawn in Delhi; a district
 *     made after 2011 (Medchal Malkajgiri) drawn in the one it came from;
 *   - the homepage line (rotating too), the footer and phone menu link;
 *   - the page only reads: one GET, nothing sent.
 *
 * Run: node scripts/test-network.js   (SHOTS=dir saves screenshots)
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
if (!PW) { console.log('network page: skipped (Playwright not installed)'); process.exit(0); }

const PN = require(path.join(__dirname, '..', '..', '..', 'backend', 'functions', 'public_network.js'));
const NOW = Date.now();
const ANSWER = PN.view({
  districts: { udupi: 48, dakshina_kannada: 254, pune: 1213, nowhere_land: 2 },
  states: { udupi: { name: 'Karnataka' }, dakshina_kannada: { name: 'Karnataka' }, pune: { name: 'Maharashtra' }, nowhere_land: { name: '' } },
  built_at: NOW - 40 * 60e3,
});
const EMPTY = PN.view({ districts: {}, states: {}, built_at: NOW });
const DELHI = PN.view({ districts: { west: 40, medchal_malkajgiri: 26 }, states: { west: { name: 'Delhi' }, medchal_malkajgiri: { name: 'Telangana' } }, built_at: NOW });
/* Every number a line may say: the total, the number of districts, a
   district's count, or one more than it. */
const TRUE_NUMBERS = new Set(['1,500+', '4']);
ANSWER.list.forEach((r) => { TRUE_NUMBERS.add(r.people.toLocaleString('en-IN') + (r.approx ? '+' : '')); if (!r.approx) TRUE_NUMBERS.add((r.people + 1).toLocaleString('en-IN')); });
const numbersIn = (t) => (t.match(/\d[\d,]*\+?/g) || []);

// The map has every district the app and backend can name.
{
  const fs = require('fs');
  const BF = path.join(__dirname, '..', '..', '..', 'backend', 'functions');
  const { districtKey } = require(path.join(BF, 'lib', 'district_geo.js'));
  const src = JSON.parse(fs.readFileSync(path.join(BF, 'assets', 'dists11.geojson'), 'utf8')).features.map((f) => districtKey(f.properties.DISTRICT));
  const mapKeys = new Set(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'network', 'india-districts.json'), 'utf8')).districts.features.map((f) => f.properties.k));
  const missing = [...new Set(src)].filter((k) => !mapKeys.has(k));
  if (missing.length) { console.log('FAIL the map lacks districts: ' + missing.slice(0, 5).join(', ') + ' (run scripts/build-network-map.js)'); process.exit(1); }
  console.log('ok   the map has all ' + mapKeys.size + ' district keys the app and backend use');
}

const API = 'https://asia-south1-rrt-new-backend.cloudfunctions.net/api/public/network';
const PORT = 19000 + Math.floor(Math.random() * 1000);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)], { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

let failed = 0;
const check = (c, m) => { if (c) console.log('ok   ' + m); else { failed++; console.log('FAIL ' + m); } };
// What a person sees: the shown text, with a space between elements.
const SEEN = (e) => {
  const parts = [];
  (function walk(n) {
    n.childNodes.forEach((c) => {
      if (c.nodeType === 3) parts.push(c.textContent);
      else if (c.nodeType === 1 && getComputedStyle(c).display !== 'none' && !c.hidden) walk(c);
    });
  })(e);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
};
const text = (page, sel) => page.$eval(sel, SEEN).catch(() => '');

async function open(browser, size, opts = {}) {
  const ctx = await browser.newContext({ viewport: size, userAgent: opts.ua });
  const calls = [];
  const foreign = [];
  let mode = opts.mode || 'ok';
  await ctx.route('**/*', (r) => {
    const u = r.request().url();
    if (u === API) {
      calls.push(r.request().method());
      if (mode === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"internal"}', headers: { 'access-control-allow-origin': '*' } });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'empty' ? EMPTY : mode === 'delhi' ? DELHI : ANSWER), headers: { 'access-control-allow-origin': '*' } });
    }
    if (u.startsWith(BASE)) return r.continue();
    foreign.push(u);
    return r.abort();
  });
  if (opts.hindi) await ctx.addInitScript(() => { try { localStorage.setItem('lang', 'hi'); } catch (e) { /* none */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, calls, foreign, errors, setMode: (m) => { mode = m; } };
}

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/network'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await PW.chromium.launch(); } catch (e) { console.log('network page: skipped (no browser: ' + e.message.split('\n')[0] + ')'); process.exit(0); }
  const shots = process.env.SHOTS;

  // ---- desktop -------------------------------------------------------------
  {
    const { page, calls, foreign, errors, ctx } = await open(browser, { width: 1366, height: 860 });
    await page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /\d/.test((document.querySelector('#nwNum strong') || {}).textContent || ''), null, { timeout: 8000 });
    await page.waitForTimeout(900);
    check(/People helping animals\. District by district\./.test(await text(page, 'h1')), 'desktop: the heading');
    check(await text(page, '#nwPlace') === 'All of India' && await text(page, '#nwNum') === '1,500+ people', 'all of India first: 1,500+ people (' + await text(page, '#nwNum') + ')');
    check(/in 4 districts across 2 states/.test(await text(page, '#nwSub')), 'in how many districts and states (' + await text(page, '#nwSub') + ')');
    check(/^Updated at /.test(await text(page, '#nwStatus')), 'when it was counted (' + await text(page, '#nwStatus') + ')');
    const rows = async () => {
      const n = await page.$$eval('.nw-row', (rs) => rs.length);
      const out = [];
      for (let i = 0; i < n; i++) out.push(await page.$eval(`.nw-row:nth-child(${i + 1})`, SEEN));
      return out;
    };
    let r = await rows();
    check(r.length === 3 && /^Pune Maharashtra 1,200\+$/.test(r[0]) && /Dakshina Kannada Karnataka 250\+/.test(r[1]) && /^Udupi Karnataka 48$/.test(r[2]), 'largest first, three at a time, "+" where rounded (' + r.join(' | ') + ')');
    check(await text(page, '#nwPage') === '1-3 of 4 districts', 'which of how many');
    await page.click('#nwNext');
    r = await rows();
    check(r.length === 1 && r[0] === 'Nowhere Land 2', 'next page (' + r.join(' | ') + ')');
    await page.fill('#nwSearch', 'karna');
    r = await rows();
    check(r.length === 2 && r.every((x) => /Karnataka/.test(x)), 'search by state or district');
    await page.fill('#nwSearch', 'udu');
    await page.click('.nw-row');
    await page.waitForTimeout(800);
    check(await text(page, '#nwPlace') === 'Udupi' && await text(page, '#nwNum') === '48 people' && await text(page, '#nwSub') === 'Karnataka', 'a district picked: Udupi, 48 people, Karnataka');
    check(await page.isVisible('#nwAll'), 'with a way back to all of India');
    await page.click('#nwAll');
    await page.waitForTimeout(800);
    check(await text(page, '#nwPlace') === 'All of India' && !(await page.isVisible('#nwAll')), 'and back');
    await page.fill('#nwSearch', 'zzz');
    check(await text(page, '.nw-empty') === 'No district matches that.', 'nothing found says so');
    await page.fill('#nwSearch', '');

    await page.waitForFunction(() => Number((document.getElementById('nwMap') || {}).getAttribute && document.getElementById('nwMap').getAttribute('data-dots')) > 0, null, { timeout: 8000 });
    const m = await page.evaluate(() => {
      const box = document.getElementById('nwMap').getBoundingClientRect();
      return { dots: Number(document.getElementById('nwMap').getAttribute('data-dots')), leaflet: !!document.querySelector('#nwMap.leaflet-container canvas'),
        legend: document.getElementById('nwLegendT').textContent, bottom: box.bottom, h: box.height, vh: innerHeight,
        over: document.documentElement.scrollWidth - innerWidth, zoom: window.__nwMap.getZoom() };
    });
    check(m.leaflet, 'the map of India\'s districts is drawn');
    check(m.dots === 1200 + 250 + 48, 'a red dot per person in each district on the map (' + m.dots + '; the one district not on it has none)');
    check(m.legend === 'One dot, one person, somewhere in their district', 'the legend says what a dot is');
    const join = await page.evaluate(() => ({ shown: !document.getElementById('nwJoin').hidden, k: document.getElementById('nwJoinK').textContent,
      line: document.getElementById('nwJoinLine').textContent, i: document.getElementById('nwJoin').getAttribute('data-line'),
      a: [document.getElementById('nwJoinA').textContent, document.getElementById('nwJoinA').href],
      b: [document.getElementById('nwJoinB').hidden, document.getElementById('nwJoinB').textContent, document.getElementById('nwJoinB').href],
      small: document.getElementById('nwJoinSmall').textContent }));
    check(join.shown && join.k === 'Today' && join.line.length > 10 && !/undefined|null|NaN/.test(join.line), 'today\'s line asking people to join (' + join.line + ')');
    check(numbersIn(join.line).every((x) => TRUE_NUMBERS.has(x)), 'every number in it is true (' + numbersIn(join.line).join(', ') + ')');
    check(join.a[0] === 'Join on Android' && /play\.google\.com/.test(join.a[1]) && !join.b[0] && join.b[1] === 'iPhone' && /apps\.apple\.com/.test(join.b[2]), 'on a computer: both stores');
    check(/at least one kind of help/.test(join.small), 'join if you can help, as RRT asks');
    check(m.bottom <= m.vh + 1 && m.h >= 460, 'the map fills the screen beside the figures (' + Math.round(m.h) + 'px)');
    check(m.over <= 0, 'nothing wider than the screen');
    if (shots) await page.screenshot({ path: path.join(shots, 'network-desktop.png') });
    // A district picked in the list: highlighted, and the map goes to it.
    await page.fill('#nwSearch', 'udu');
    await page.click('.nw-row');
    await page.waitForTimeout(1100);
    let z = await page.evaluate(() => ({ picked: document.getElementById('nwMap').getAttribute('data-picked'), zoom: window.__nwMap.getZoom(), c: window.__nwMap.getCenter() }));
    check(z.picked === 'udupi' && z.zoom > m.zoom + 2 && Math.abs(z.c.lat - 13.4) < 0.6 && Math.abs(z.c.lng - 74.9) < 0.6, 'the district picked is highlighted and the map goes to it (zoom ' + z.zoom + ')');
    if (shots) await page.screenshot({ path: path.join(shots, 'network-desktop-udupi.png') });
    await page.click('#nwAll');
    await page.waitForTimeout(1100);
    await page.fill('#nwSearch', '');
    // A district picked on the map itself: Dakshina Kannada, by clicking it.
    const pt = await page.evaluate(() => {
      const p = window.__nwMap.latLngToContainerPoint([12.85, 75.25]), b = document.getElementById('nwMap').getBoundingClientRect();
      return { x: b.left + p.x, y: b.top + p.y };
    });
    await page.mouse.move(pt.x, pt.y);
    await page.waitForTimeout(200);
    check(/Dakshina Kannada\s*250\+ people/.test(await text(page, '.leaflet-tooltip')), 'pointing at a district names it and its people (' + await text(page, '.leaflet-tooltip') + ')');
    await page.mouse.click(pt.x, pt.y);
    await page.waitForTimeout(900);
    check(await text(page, '#nwPlace') === 'Dakshina Kannada' && await text(page, '#nwNum') === '250+ people', 'clicking a district on the map picks it');
    // One with nobody yet.
    const pt2 = await page.evaluate(() => {
      const p = window.__nwMap.latLngToContainerPoint([26.85, 80.95]), b = document.getElementById('nwMap').getBoundingClientRect();
      return { x: b.left + p.x, y: b.top + p.y };
    });
    await page.mouse.click(pt2.x, pt2.y);
    await page.waitForTimeout(900);
    check(await text(page, '#nwPlace') === 'Lucknow' && await text(page, '#nwNum') === '0 people' && /Nobody here yet/.test(await text(page, '#nwSub')), 'a district with nobody yet says so (' + await text(page, '#nwPlace') + ')');
    await page.click('#nwAll');
    await page.waitForTimeout(800);
    check(await page.$eval('.rr-ftr', (f) => !!f.querySelector('a[href="/network"]')), 'the footer links here');
    if (shots) await page.screenshot({ path: path.join(shots, 'network-desktop.png') });

    // Hindi, from the header's switch.
    await page.click('.rr-hdr .rr-lang button[data-l=hi]');
    await page.waitForTimeout(400);
    check(/जानवरों की मदद करते लोग/.test(await text(page, 'h1')) && /लोग$/.test(await text(page, '#nwNum')) && await text(page, '#nwPlace') === 'पूरा भारत', 'Hindi');
    check(/2 राज्यों के 4 ज़िलों में/.test(await text(page, '#nwSub')) && /पर अपडेट$/.test(await text(page, '#nwStatus')), 'Hindi: districts, states, when (' + await text(page, '#nwSub').then((s) => s.slice(0, 30)) + ')');
    check(/[\u0900-\u097F]/.test(await text(page, '#nwJoinLine')) && await text(page, '#nwJoinK') === 'आज', 'today\'s line in Hindi');
    if (shots) await page.screenshot({ path: path.join(shots, 'network-desktop-hi.png') });
    check(calls.length === 1 && calls[0] === 'GET', 'one GET, nothing sent (' + calls.join(',') + ')');
    // (Every page reads the shop switch, assets/rr-site.js; nothing else may go out.)
    const other = foreign.filter((u) => !/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/rrt-new-backend\/databases\/\(default\)\/documents\/app_config\/flags/.test(u));
    check(other.length === 0, 'no other server asked for anything: no map tiles (' + other.slice(0, 3).join(', ') + ')');
    check(errors.length === 0, 'desktop: no script errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // ---- phone ---------------------------------------------------------------
  {
    const { page, errors, ctx } = await open(browser, { width: 390, height: 844 }, { ua: 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
    await page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => /\d/.test((document.querySelector('#nwNum strong') || {}).textContent || ''), null, { timeout: 8000 });
    await page.waitForTimeout(900);
    await page.waitForFunction(() => Number(document.getElementById('nwMap').getAttribute('data-dots')) > 0, null, { timeout: 8000 });
    const lay = await page.evaluate(() => {
      const box = (q) => document.querySelector(q).getBoundingClientRect();
      const map = box('#nwMap'), fig = box('.nw-fig'), tools = box('.nw-tools');
      return { mapW: map.width, mapH: map.height, vw: innerWidth, order: fig.bottom <= map.top + 1 && map.bottom <= tools.top + 1,
        list: getComputedStyle(document.querySelector('.nw-list')).display, pick: getComputedStyle(document.querySelector('#nwPick')).display,
        over: document.documentElement.scrollWidth - innerWidth,
        cut: [...document.querySelectorAll('.nw-fig *, .nw-tools *')].filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').length };
    });
    check(lay.order && lay.mapW >= lay.vw - 60 && lay.mapH >= 360, 'phone: the figure, then the map across the screen (' + Math.round(lay.mapW) + 'x' + Math.round(lay.mapH) + '), then the picker');
    check(lay.list === 'none' && lay.pick === 'block', 'phone: a district picker instead of the list');
    check(lay.over <= 0 && lay.cut === 0, 'phone: nothing wider than the screen, nothing cut');
    await page.selectOption('#nwPick', 'pune');
    await page.waitForTimeout(800);
    check(await text(page, '#nwPlace') === 'Pune' && await text(page, '#nwNum') === '1,200+ people' && await page.$eval('#nwMap', (m) => m.getAttribute('data-picked')) === 'pune', 'phone: a district picked, on the map too');
    await page.selectOption('#nwPick', '');
    await page.waitForTimeout(800);
    check(await text(page, '#nwPlace') === 'All of India', 'phone: back to all of India');
    if (shots) await page.screenshot({ path: path.join(shots, 'network-phone.png'), fullPage: true });
    await page.click('#rrMenuBtn');
    check(await page.isVisible('#rrMob a[href="/network"]'), 'phone: the menu links here');
    check(errors.length === 0, 'phone: no script errors ' + JSON.stringify(errors));
    await ctx.close();
  }

  // ---- today's line: a different one each visit; a forced one; Delhi -----------
  {
    const r = await open(browser, { width: 1280, height: 800 });
    const seen = [];
    let allTrue = true;
    for (let v = 0; v < 6; v++) {
      await r.page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
      await r.page.waitForFunction(() => !document.getElementById('nwJoin').hidden, null, { timeout: 8000 });
      const x = await r.page.evaluate(() => [document.getElementById('nwJoin').getAttribute('data-line'), document.getElementById('nwJoinLine').textContent]);
      seen.push(x[0]);
      if (!numbersIn(x[1]).every((n) => TRUE_NUMBERS.has(n))) { allTrue = false; console.log('     untrue: ' + x[1]); }
    }
    check(seen.every((x, i) => i === 0 || x !== seen[i - 1]) && new Set(seen).size >= 3, 'a different line on every visit (' + seen.join(',') + ')');
    check(allTrue, 'and every number in every one is true');
    await r.page.goto(BASE + '/network?join=0', { waitUntil: 'domcontentloaded' });
    await r.page.waitForFunction(() => !document.getElementById('nwJoin').hidden, null, { timeout: 8000 });
    check(await text(r.page, '#nwJoinLine') === '1,500+ people already said yes. The next yes could be yours.', 'a line can be shown on purpose (?join=0)');
    await r.ctx.close();

    const p = await open(browser, { width: 390, height: 844 }, { ua: 'Mozilla/5.0 (Linux; Android 14; SM-A146B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
    await p.page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await p.page.waitForFunction(() => !document.getElementById('nwJoin').hidden, null, { timeout: 8000 });
    const pj = await p.page.evaluate(() => [document.getElementById('nwJoinA').textContent, document.getElementById('nwJoinA').href, document.getElementById('nwJoinB').hidden]);
    check(pj[0] === 'Join today' && /play\.google\.com/.test(pj[1]) && pj[2], 'on an Android phone: one Join today button, to Google Play');
    if (shots) await p.page.screenshot({ path: path.join(shots, 'network-phone-join.png') });
    await p.ctx.close();

    const dl = await open(browser, { width: 1280, height: 800 }, { mode: 'delhi' });
    await dl.page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await dl.page.waitForFunction(() => Number(document.getElementById('nwMap').getAttribute('data-dots')) > 0, null, { timeout: 8000 });
    const where = await dl.page.evaluate(() => {
      const dots = []; window.__nwMap.eachLayer((l) => { if (l instanceof L.CircleMarker) dots.push(l.getLatLng()); });
      const inDelhi = dots.filter((d) => d.lat > 28.3 && d.lat < 29 && d.lng > 76.7 && d.lng < 77.5).length;
      const nearHyd = dots.filter((d) => d.lat > 16.6 && d.lat < 18.0 && d.lng > 77.0 && d.lng < 79.2).length;
      return { all: dots.length, inDelhi, nearHyd };
    });
    check(where.all === 66 && where.inDelhi === 40, 'West is drawn in Delhi, not Sikkim (' + where.inDelhi + ' of 40)');
    check(where.nearHyd === 26, 'Medchal Malkajgiri (made in 2016) is drawn in Rangareddy, the district it came from');
    await dl.page.selectOption('#nwPick', 'medchal_malkajgiri').catch(() => {});
    await dl.page.fill('#nwSearch', 'medchal');
    await dl.page.click('.nw-row');
    await dl.page.waitForTimeout(1100);
    const c = await dl.page.evaluate(() => window.__nwMap.getCenter());
    check(await text(dl.page, '#nwPlace') === 'Medchal Malkajgiri' && Math.abs(c.lat - 17.3) < 0.8 && Math.abs(c.lng - 78.2) < 0.9, 'picking it shows it there');
    check(dl.errors.length === 0, 'no script errors ' + JSON.stringify(dl.errors));
    await dl.ctx.close();
  }

  // ---- a failed load, then trying again; an empty network --------------------
  {
    const t = await open(browser, { width: 1280, height: 800 }, { mode: 'fail' });
    await t.page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await t.page.waitForFunction(() => /could not be loaded/.test(document.getElementById('nwStatus').textContent), null, { timeout: 8000 });
    check(await t.page.isVisible('#nwStatus button') && !(await t.page.$('#nwNum strong')), 'a failed load says so, with no figure');
    check(await t.page.isVisible('#nwJoin') && !/\d/.test(await text(t.page, '#nwJoinLine')), 'today\'s line is still there, one without figures (' + await text(t.page, '#nwJoinLine') + ')');
    t.setMode('ok');
    await t.page.click('#nwStatus button');
    await t.page.waitForFunction(() => /1,500\+/.test(document.getElementById('nwNum').textContent), null, { timeout: 8000 });
    check(!(await t.page.isVisible('#nwStatus button')), 'and trying again brings the figures');
    check(t.errors.length === 0, 'no script errors on failure');
    await t.ctx.close();

    const e = await open(browser, { width: 1280, height: 800 }, { mode: 'empty' });
    await e.page.goto(BASE + '/network', { waitUntil: 'domcontentloaded' });
    await e.page.waitForFunction(() => /Counting starts/.test(document.getElementById('nwSub').textContent), null, { timeout: 8000 });
    check(await text(e.page, '.nw-empty') === 'No districts yet.', 'an empty network: no districts yet');
    await e.ctx.close();
  }

  // ---- the homepage line -----------------------------------------------------
  {
    const h = await open(browser, { width: 1280, height: 800 });
    await h.page.goto(BASE + '/?join=0', { waitUntil: 'domcontentloaded' });
    await h.page.waitForSelector('#net:not([hidden])', { timeout: 8000 });
    check(await text(h.page, '#net') === '1,500+ people in 4 districts so far See the network', 'homepage: how many so far, a link to the network (' + await text(h.page, '#net') + ')');
    check(await h.page.$eval('#net', (a) => a.getAttribute('href')) === '/network', 'homepage: it goes to /network');
    await h.page.click('.rr-hdr .rr-lang button[data-l=hi]');
    await h.page.waitForTimeout(300);
    check(await text(h.page, '#net') === 'अब तक 4 ज़िलों में 1,500+ लोग नेटवर्क देखें', 'homepage: Hindi (' + await text(h.page, '#net') + ')');
    if (shots) await h.page.screenshot({ path: path.join(shots, 'network-home.png') });
    const lines = [];
    let homeTrue = true;
    for (let v = 0; v < 4; v++) {
      await h.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      await h.page.waitForSelector('#net:not([hidden])', { timeout: 8000 });
      lines.push(await h.page.$eval('#net', (a) => a.getAttribute('data-line')));
      const t = await h.page.$eval('#netT', (e) => e.textContent);
      if (!numbersIn(t).every((x) => TRUE_NUMBERS.has(x))) { homeTrue = false; console.log('     untrue: ' + t); }
    }
    check(lines.every((x, i) => i === 0 || x !== lines[i - 1]), 'homepage: a different line on every visit (' + lines.join(',') + '), every number true');
    check(homeTrue, 'homepage: every number in every line is true');
    check(h.errors.length === 0, 'homepage: no script errors ' + JSON.stringify(h.errors));
    await h.ctx.close();
    const hf = await open(browser, { width: 1280, height: 800 }, { mode: 'fail' });
    await hf.page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await hf.page.waitForTimeout(1200);
    check(await hf.page.$eval('#net', (a) => a.hidden), 'homepage: no line when the figures cannot be had');
    await hf.ctx.close();
  }

  await browser.close();
  console.log(failed ? 'network page: FAILED' : 'network page: all passed');
  process.exit(failed ? 1 : 0);
})();
