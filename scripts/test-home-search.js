#!/usr/bin/env node
/**
 * The homepage search in a real browser (Chromium through Playwright):
 * results show on the page the way a search engine shows them, not in a
 * drawer.
 *   - Enter turns the page into results (?q= in the address), with the best
 *     answer's first lines on top and the rest under "Read the full answer";
 *   - a result that is one of our answers opens in place under its +;
 *   - a suggestion from the dropdown lands on the results page (&a=);
 *   - People also ask opens in place too;
 *   - Back returns to the previous results, then to the plain home page;
 *   - a shared /?q= link opens straight on its results;
 *   - the drawer never opens from a search.
 *
 * Run: node scripts/test-home-search.js
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
if (!PW) { console.log('home search: skipped (Playwright not installed)'); process.exit(0); }

const PORT = 19000 + Math.floor(Math.random() * 1000);
const BASE = 'http://127.0.0.1:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'dev-serve.js'), path.join(__dirname, '..'), String(PORT)],
  { stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch (e) { /* gone */ } });

(async () => {
  for (let i = 0; i < 50; i++) {
    try { await fetch(BASE + '/'); break; } catch (e) { await new Promise((r) => setTimeout(r, 100)); }
  }
  let browser;
  try { browser = await PW.chromium.launch(); } catch (e) {
    console.log('home search: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }
  const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
  const pass = (m) => console.log('ok   ' + m);
  const check = (cond, m) => (cond ? pass(m) : fail(m));

  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 860 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    const drawerOpen = () => page.evaluate(() => document.getElementById('sheet').classList.contains('open'));
    const path_ = () => page.url().slice(BASE.length);

    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    check(!(await page.isVisible('#serp')), name + ': the home page shows no results');

    await page.fill('#q', 'can members see my phone number');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    check(await page.isVisible('#serp'), name + ': Enter shows the results on the page');
    check(!(await drawerOpen()), name + ': and no drawer opens');
    check(path_() === '/?q=can%20members%20see%20my%20phone%20number', name + ': the address carries the search');
    const top = await page.evaluate(() => ({
      title: (document.querySelector('#serp .sr-box h2') || {}).textContent,
      bullets: document.querySelectorAll('#serp .sr-box > .sr-body li').length,
      more: !!document.querySelector('#serp .sr-box details.sr-full'),
    }));
    check(top.title === 'Is RRT a directory of members and their phone numbers?', name + ': the best answer is on top');
    check(top.bullets === 3 && top.more, name + ': its first lines, the rest under "Read the full answer"');
    await page.click('#serp .sr-box details.sr-full > summary');
    check(await page.evaluate(() => document.querySelectorAll('#serp .sr-box li').length) > 3, name + ': which opens in place');

    const results = await page.evaluate(() => document.querySelectorAll('#serp .sr-list > *').length);
    check(results >= 5, name + ': a list of results under it (' + results + ')');
    await page.click('#serp .sr-list .sr-x > summary');
    check(await page.evaluate(() => !!document.querySelector('#serp .sr-list .sr-x[open] .sr-body p')),
      name + ': a result that is one of our answers opens in place');
    check(!(await drawerOpen()), name + ': still no drawer');
    await page.click('#serp .sr-paa .sr-x > summary');
    check(await page.evaluate(() => !!document.querySelector('#serp .sr-paa .sr-x[open] .sr-body')),
      name + ': People also ask opens in place');

    await page.fill('#q', 'track location');
    await page.waitForTimeout(150);
    const firstSuggestion = await page.$('#results [data-i]');
    await firstSuggestion.dispatchEvent('mousedown');
    await page.waitForTimeout(250);
    check(path_() === '/?q=track%20location&a=f4', name + ': a suggestion lands on the results page with its answer');
    check((await page.textContent('#serp .sr-box h2')) === 'Does RRT continuously track my location?', name + ': on top');
    check(!(await drawerOpen()), name + ': no drawer from a suggestion either');

    await page.goBack(); await page.waitForTimeout(250);
    check((await page.inputValue('#q')) === 'can members see my phone number', name + ': Back returns to the previous results');
    await page.goBack(); await page.waitForTimeout(250);
    check(!(await page.isVisible('#serp')) && (await page.isVisible('h1')), name + ': and then to the plain home page');

    await page.goto(BASE + '/?q=whatsapp%20group', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    check((await page.textContent('#serp .sr-box h2')) === 'Why is RRT different from a WhatsApp group?',
      name + ': a shared link opens straight on its results');
    const reds = await page.evaluate(() => Array.prototype.filter.call(document.querySelectorAll('#serp .btn'),
      (b) => getComputedStyle(b).backgroundColor !== getComputedStyle(document.body).backgroundColor &&
        /^rgb\((1[5-9]\d|2\d\d), ?\d{1,2}, ?\d{1,2}\)$/.test(getComputedStyle(b).backgroundColor)).length);
    check(reds <= 1, name + ': one red button at most (' + reds + ')');
    check(errors.length === 0, name + ': no script errors' + (errors.length ? ': ' + errors.join('; ') : ''));
    await page.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'home search: FAILED' : 'home search: all passed');
  process.exit(process.exitCode || 0);
})().catch((e) => { console.log('FAIL ' + e.stack); process.exit(1); });
