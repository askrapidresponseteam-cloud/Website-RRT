#!/usr/bin/env node
/* The lab animal rules objection (/lab-animal-rules): the page, the way in
   from the home page, and its link to the backend count. No browser needed
   (runs in verify.sh). Exits 1 if anything is off. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ok    ' : '  FAIL  ') + m); if (!c) fails++; };

const page = read('lab-animal-rules.html');
const home = read('index.html');
const backend = fs.readFileSync(path.join(ROOT, '..', '..', 'backend', 'functions', 'campaigns.js'), 'utf8');
const routes = fs.readFileSync(path.join(ROOT, '..', '..', 'backend', 'functions', 'index.js'), 'utf8');

ok(['<!-- rr:head -->', '<!-- rr:header -->', '<!-- rr:footer -->'].every((m) => page.includes(m)), 'page carries the shared site chrome');
ok(read('scripts/site-chrome/heal.py').includes("'lab-animal-rules.html'"), 'registered with the theme healer');
ok(page.includes('<link href="https://rapid-response.in/lab-animal-rules" rel="canonical">'), 'canonical URL');
ok(read('sitemap.xml').includes('https://rapid-response.in/lab-animal-rules'), 'in the sitemap');
ok((page.match(/data-lang="en"/g) || []).length === (page.match(/data-lang="hi"/g) || []).length, 'every English line has a Hindi line');
ok(!new RegExp('[' + String.fromCharCode(0x2013, 0x2014) + ']').test(page), 'no long dashes');
ok(!/<script[^>]+src="https?:/.test(page), 'no script from another site');

// the recipients, written once
const list = (name) => [...(((page.match(new RegExp('var ' + name + ' = \\[([^\\]]*)\\]')) || [])[1]) || '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
const to = list('TO'), cc = list('CC');
ok(to.length >= 1 && to.concat(cc).every((a) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(a)), 'every recipient is a valid address: ' + to.concat(cc).join(', '));
ok(new Set(to.concat(cc)).size === to.length + cc.length, 'no address twice');
ok(to.concat(cc).every((a) => page.split(a).length - 1 === 1), 'each address appears once in the source (everything else uses TO and CC)');
ok(/mailto:' \+ TO\.join\(','\) \+ '\?cc='/.test(page) && (page.match(/&cc=' \+ encodeURIComponent\(CC\.join/g) || []).length === 3, 'every way to send carries the CC');

// the letter: each line in both languages
const block = (name) => (page.match(new RegExp('var ' + name + ' = \\[([\\s\\S]*?)\\n  \\];')) || [])[1] || '';
for (const name of ['ROLES', 'POINTS']) {
  const items = block(name).split(/\n    \{ id: /).slice(1);
  ok(items.length >= 4, name + ' lists its choices');
  for (const it of items) ok(/len: \[/.test(it) && /lhi: \[/.test(it) && /\ben: '/.test(it) && /\bhi: '/.test(it), name + ' ' + it.split("'")[1] + ' has English and Hindi');
}

// the count: same campaign, same route, same closing time as the backend
const id = (page.match(/var CAMPAIGN = '([^']+)'/) || [])[1];
ok(!!id && backend.includes(`'${id}': { closes_at: endOfIstDay(2026, 11, 6) }`), 'campaign ' + id + ' exists in backend campaigns.js, closing at the end of 6 November');
ok(routes.includes("app.get('/campaign/:id'") && routes.includes("app.post('/campaign/:id/sent'"), 'backend routes the page calls exist');
ok(page.includes("cloudfunctions.net/api/campaign/' + CAMPAIGN") && page.includes("API + '/sent'"), 'page calls those routes');
ok(page.includes('var CLOSES = Date.UTC(2026, 10, 7) - IST;'), 'page closes when the backend does');
ok(page.includes('var ASK_BY = Date.UTC(2026, 10, 6) - IST;'), 'page asks people to send by the end of 5 November');

// the poster and the way in from home
ok(fs.existsSync(path.join(ROOT, 'assets', 'lab-animal-rules-qr.svg')) && page.includes('/assets/lab-animal-rules-qr.svg'), 'poster QR code is served from this site');
ok(home.includes('href="/lab-animal-rules"') && home.includes('Date.now()<Date.UTC(2026,10,7)-5.5*36e5'), 'home page links to it until it closes');
ok(/labrules:\{w:"[^"]*objection/.test(home), 'home search finds it');

console.log(fails ? `lab animal rules: ${fails} failed` : 'lab animal rules: all passed');
process.exit(fails ? 1 : 0);
