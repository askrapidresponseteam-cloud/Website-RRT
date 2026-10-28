#!/usr/bin/env node
/**
 * What the homepage says Rapid Response is, in a real browser (Chromium
 * through Playwright): people helping each other, not a helpline and not a
 * place to report a problem and move on; everyone who joins offers at least
 * one kind of help (shared/help-offers.json).
 *
 *   - the heading and the line under it, in English and in Hindi;
 *   - a chip for every way of helping, from the shared list, in the page
 *     language; a chip opens "Who should join" with what each one means;
 *   - the SOS drawer says you stay and do your part, and nobody is sent in
 *     your place; "What is RRT?" and "Who should join RRT?" say the same;
 *   - nothing on the page still says "How can we help", "nearest people" or
 *     "Anyone can join";
 *   - nothing is wider than a phone, and no script errors.
 *
 * Run: node scripts/test-home-message.js   (SHOTS=dir saves screenshots)
 * Skips (exit 0) where Playwright is not installed.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function playwright() {
  for (const p of ['playwright', '/opt/npm-tools/node_modules/playwright']) {
    try { return require(p); } catch (e) { /* next */ }
  }
  return null;
}
const PW = playwright();
if (!PW) { console.log('home message: skipped (Playwright not installed)'); process.exit(0); }

const OFFERS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'shared', 'help-offers.json'), 'utf8')).offers;
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
    console.log('home message: skipped (no browser for Playwright: ' + e.message.split('\n')[0] + ')');
    process.exit(0);
  }
  const fail = (m) => { console.log('FAIL ' + m); process.exitCode = 1; };
  const pass = (m) => console.log('ok   ' + m);
  const check = (cond, m) => (cond ? pass(m) : fail(m));

  // The page as served, before any script: the English chips are already there.
  const raw = await (await fetch(BASE + '/')).text();
  check(OFFERS.every((o) => raw.includes('data-sheet="roles" title="' + o.en_note.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">' + o.en + '</button>')),
    'the English chips are in the page itself (no script needed)');
  check(!/How can we help/i.test(raw) && !/nearest people/i.test(raw) && !/Anyone can join/i.test(raw) && !/willing to help when you can/i.test(raw),
    'nothing still says "How can we help", "nearest people" or "Anyone can join"');

  for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const page = await browser.newPage({ viewport });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) => (r.request().url().startsWith(BASE) ? r.continue() : r.abort()));
    await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* none */ } });
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);

    const v = await page.evaluate(() => ({
      h1: document.querySelector('main h1').textContent,
      lead: document.querySelector('.pact-lead').textContent,
      chips: [...document.querySelectorAll('#gives button')].map((b) => b.textContent),
      sos: (document.querySelector('.qrow .btn') || {}).textContent,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    check(v.h1 === 'People helping each other help animals.', name + ': the heading says it is people helping each other');
    check(/Not a helpline, and not a place to report a problem and move on/.test(v.lead) && /Nobody can help every time/.test(v.lead) && /at least one kind of help/.test(v.lead),
      name + ': the line under it: not a helpline, not report and move on, at least one kind of help');
    check(JSON.stringify(v.chips) === JSON.stringify(OFFERS.map((o) => o.en)), name + ': a chip for every way of helping, in order (' + v.chips.length + ')');
    check(v.overflow <= 0, name + ': nothing wider than the screen (' + v.overflow + 'px)');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'home-' + name + '.png') });

    // A chip: who should join, with what each one means.
    await page.click('#gives button >> nth=7');
    await page.waitForTimeout(350);
    const roles = await page.evaluate(() => ({
      open: document.getElementById('sheet').classList.contains('open'),
      text: document.getElementById('shB').textContent,
    }));
    check(roles.open && /Everyone here helps/.test(roles.text) && /please join only if you can offer at least one/.test(roles.text),
      name + ': a chip opens "Who should join"');
    check(OFFERS.every((o) => roles.text.includes(o.en) && roles.text.includes(o.en_note)), name + ': with every way of helping and what it means');
    check(/Not numbers of NGOs or animal lovers who are already overwhelmed/.test(roles.text), name + ': the right contacts are people who act, not numbers');
    await page.click('#shX');
    await page.waitForTimeout(250);

    // The SOS drawer.
    await page.click('.qrow .btn');
    await page.waitForTimeout(350);
    const sos = await page.evaluate(() => document.getElementById('shB').textContent);
    check(/You stay with the animal and do what you can/.test(sos) && /not a way to report an animal and move on/.test(sos) && /Nobody is sent in your place/.test(sos),
      name + ': SOS: you stay and do your part; nobody is sent in your place');
    await page.click('#shX');
    await page.waitForTimeout(250);

    // Hindi.
    await page.evaluate(() => window.setLang('hi'));
    await page.waitForTimeout(150);
    const h = await page.evaluate(() => ({
      h1: document.querySelector('main h1').textContent,
      lead: document.querySelector('.pact-lead').textContent,
      chips: [...document.querySelectorAll('#gives button')].map((b) => b.textContent),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    check(h.h1 === 'जानवरों के लिए, आपस में मदद करते लोग।' && /हेल्पलाइन नहीं/.test(h.lead), name + ': Hindi heading and line');
    check(JSON.stringify(h.chips) === JSON.stringify(OFFERS.map((o) => o.hi)), name + ': Hindi chips');
    check(h.overflow <= 0, name + ': Hindi fits too (' + h.overflow + 'px)');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'home-hi-' + name + '.png') });
    await page.evaluate(() => window.setLang('en'));

    // The answers in search say the same.
    await page.fill('#q', 'what is rrt');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const f1 = await page.evaluate(() => ({ t: (document.querySelector('#serp .sr-box h2') || {}).textContent, all: document.getElementById('serp').textContent,
      hidden: getComputedStyle(document.querySelector('.pact')).display }));
    check(f1.t === 'What is RRT?' && /Not a helpline, and not a reporting platform/.test(f1.all), name + ': "What is RRT?" says it is not a helpline or a reporting platform');
    check(f1.hidden === 'none', name + ': the results page hides the line and chips, like the heading');
    await page.goto(BASE + '/?q=' + encodeURIComponent('who should join'), { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(300);
    const f12 = await page.evaluate(() => document.getElementById('serp').textContent);
    check(/Anyone who can offer at least one kind of help/.test(f12) && /please join only if you can offer at least one of these/.test(f12) && OFFERS.every((o) => f12.includes(o.en)),
      name + ': "Who should join RRT?" lists the ways of helping');

    check(errors.length === 0, name + ': no script errors ' + JSON.stringify(errors));
    await page.close();
  }
  await browser.close();
  console.log(process.exitCode ? 'home message: FAILED' : 'home message: all passed');
  process.exit(process.exitCode || 0);
})();
