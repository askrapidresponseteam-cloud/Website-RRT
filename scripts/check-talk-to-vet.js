#!/usr/bin/env node
/* "Talk to a vet" on the website: the page and every way in.
   No browser needed (runs in verify.sh); the full in-browser checks live in
   the platform's release notes. Exits 1 on the first broken promise. */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) fails++; };

const page = read('talk-to-a-vet.html');
ok(['<!-- rr:head -->', '<!-- rr:header -->', '<!-- rr:footer -->'].every((m) => page.includes(m)), 'page carries the shared site chrome');
ok(/<title>Talk to a vet online - Rapid Response<\/title>/.test(page), 'title');
ok(page.includes('rel="canonical"') && page.includes('https://rapid-response.in/talk-to-a-vet'), 'canonical URL');
ok((page.match(/data-lang="en"/g) || []).length === (page.match(/data-lang="hi"/g) || []).length, 'every English line has a Hindi line');
ok(page.includes('/vetConsult/consult/public-status'), 'live status comes from the vet platform (same count as the app)');
ok(page.includes('play.google.com/store/apps/details?id=com.rrt.sos') && page.includes('apps.apple.com/in/app/rapid-response/id6758672498'), 'both store links');
ok(page.includes('href="/vet"'), 'vets are sent to the vet application');
const visible = page.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
ok(!/(?:\+?91[\s-]?)?[6-9]\d{9}\b/.test(visible), 'no phone numbers on the page');
ok(!/tel:/.test(page), 'no call links: chat and video stay inside RRT');

// the status script, run with fake answers
const script = page.match(/<script>\s*\/\* Live status[\s\S]*?<\/script>/);
ok(!!script, 'status script present');
if (script) {
  const els = {};
  const el = (id) => (els[id] = els[id] || { id, hidden: true, textContent: '', classList: { toggle() {}, add() {} } });
  const run = (answer) => {
    const doc = { documentElement: { lang: 'en' }, readyState: 'complete', getElementById: el, addEventListener() {} };
    const sandbox = { document: doc, window: {}, navigator: { userAgent: 'desktop' }, localStorage: { getItem: () => null },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(answer) }) };
    sandbox.window = sandbox;
    vm.runInNewContext(script[0].replace(/<\/?script>/g, ''), sandbox);
    return new Promise((r) => setTimeout(() => r(sandbox), 5));
  };
  (async () => {
    await run({ ok: true, enabled: true, vets_online: 1, fee_inr: 199, next_available_label: null });
    ok(els.tvStatusText.textContent === '1 verified vet online now' && els.tvStatus.hidden === false, 'one vet: "1 verified vet online now"');
    ok(els.tvFeeEn.textContent.startsWith('₹199'), 'fee from the backend');
    await run({ ok: true, enabled: false, vets_online: 0, fee_inr: 199, next_available_label: null });
    ok(/paused/.test(els.tvStatusText.textContent), 'switched off in admin: "paused"');
    finish();
  })();
} else finish();

function finish() {
  const home = read('index.html');
  ok(home.includes('<a class="btn" href="/talk-to-a-vet" data-i="qVet">'), 'homepage quick button');
  ok(/qVet:"Talk to a vet"/.test(home) && /qVet:"वेट से बात करें"/.test(home), 'homepage button in both languages');
  ok(home.includes('out.intent="talkvet"') && home.includes('case "talkvet"'), 'homepage search: "online vet", "sick dog" and the like lead here');
  ok(/var EXPLORE=\[[^\]]*"talkvet"/.test(home), 'homepage Explore list');
  ok(read('sitemap.xml').includes('https://rapid-response.in/talk-to-a-vet'), 'in the sitemap');
  const chrome = read('scripts/site-chrome/chrome.py');
  ok(chrome.includes("('/talk-to-a-vet', 'Talk to a vet'"), 'in the shared header and footer');
  console.log(fails ? `\n${fails} check(s) failed` : '\nTalk to a vet: website checks pass.');
  process.exit(fails ? 1 : 0);
}
