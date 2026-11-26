#!/usr/bin/env node
'use strict';
/**
 * Firebase Hosting for rapid-response.in, generated from vercel.json so the two
 * never drift. vercel.json stays the one place routes, redirects and headers
 * are written (scripts/check-storefront.js and the shop read it too).
 *
 *   node tools/firebase-config.js           write firebase.json and functions-web/routes.json
 *   node tools/firebase-config.js --check   fail if either is out of date (CI runs this)
 *
 * What changes on the way over:
 *   - Vercel can proxy a path straight to another site; Firebase Hosting cannot.
 *     Every external rewrite (the partner stores' feeds and APIs) goes to one
 *     small Cloud Function, webStoreProxy (functions-web/), which forwards only
 *     the exact paths listed here, to the exact store each was meant for.
 *   - Internal rewrites point at the built .html file (Firebase wants a file).
 *   - Vercel path patterns (:name, :name(regex), :path*) become Firebase globs.
 *   - HTML and other unhashed files are revalidated on every visit, as on Vercel
 *     (Firebase would otherwise let browsers keep them for an hour).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const REGION = 'asia-south1';
const FUNCTION_ID = 'webStoreProxy';
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// ---- Vercel pattern -> Firebase glob, and -> a regex for the proxy ----------
function toGlob(src) {
  return src
    .replace(/\/:[A-Za-z_]\w*\*/g, '/**')            // /:path*  -> /**
    .replace(/:[A-Za-z_]\w*(\([^)]*\))?/g, '*');     // :name, :name(re) -> *
}
function toRegex(pattern) {
  // Returns { re, names } where names are the captured parameter names in order.
  const names = [];
  let out = '';
  for (let i = 0; i < pattern.length;) {
    const ch = pattern[i];
    if (ch === ':') {
      const m = /^:([A-Za-z_]\w*)(\(((?:[^()]|\([^()]*\))*)\))?(\*)?/.exec(pattern.slice(i));
      names.push(m[1]);
      if (m[4]) out += '(.*)';
      else out += '(' + (m[3] || '[^/]+') + ')';
      i += m[0].length;
    } else {
      out += /[.+?^${}()|[\]\\]/.test(ch) ? '\\' + ch : ch;
      i += 1;
    }
  }
  return { re: '^' + out + '$', names };
}

// ---- split Vercel rewrites into store proxies and page rewrites -------------
const proxies = [];   // [{ prefix, re, dest, methods }]
const pageRewrites = [];
for (const r of vercel.rewrites || []) {
  if (/^https:\/\//.test(r.destination)) {
    const prefix = '/' + r.source.split('/')[1];
    const { re, names } = toRegex(r.source.slice(prefix.length));
    let dest = r.destination;
    names.forEach((n, i) => { dest = dest.replace(new RegExp(':' + n + '(?![\\w])'), '$' + (i + 1)); });
    const methods = /graphql\.json$/.test(r.source) ? ['GET', 'HEAD', 'POST', 'OPTIONS'] : ['GET', 'HEAD'];
    proxies.push({ prefix, re, dest, methods });
  } else {
    const file = r.destination.replace(/\/$/, '') + '.html';
    if (!fs.existsSync(path.join(ROOT, file.slice(1)))) throw new Error('rewrite to a page that does not exist: ' + r.destination);
    pageRewrites.push({ source: toGlob(r.source), destination: file });
  }
}
const prefixes = [...new Set(proxies.map((p) => p.prefix))];

// ---- headers ------------------------------------------------------------------
// Every path except the store proxy routes (first segment ending in -api), whose
// function sets its own short cache. Firebase headers have no negative globs and
// RE2 has no lookahead, so the regex spells out "last four characters are not -api".
const NOT_PROXY = '^/(?:[^/]{0,3}|[^/]*(?:[^/]{3}[^i/]|[^/]{2}[^p/]i|[^/][^a/]pi|[^-/]api))(?:/.*)?$';
if (prefixes.some((p) => !/-api$/.test(p))) throw new Error('store proxy prefixes must end in -api: ' + prefixes.join(' '));
const headers = [{ regex: NOT_PROXY, headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] }];
for (const h of vercel.headers || []) {
  const glob = toGlob(h.source);
  headers.push({ source: glob === '/**' ? '**' : glob, headers: h.headers.map((x) => ({ key: x.key, value: x.value })) });
  if (h.source === '/app-demo') headers.push({ source: '/app-demo.html', headers: h.headers.map((x) => ({ key: x.key, value: x.value })) });
}

const firebase = {
  hosting: {
    target: 'web',
    public: 'dist',
    predeploy: ['npm run build'],
    cleanUrls: !!vercel.cleanUrls,
    ignore: ['**/.*', '**/node_modules/**'],
    redirects: (vercel.redirects || []).map((r) => ({ source: toGlob(r.source), destination: r.destination, type: r.permanent ? 301 : 302 })),
    rewrites: [
      ...prefixes.map((p) => ({ source: p + '/**', function: { functionId: FUNCTION_ID, region: REGION } })),
      ...pageRewrites,
    ],
    headers,
  },
  functions: [{ source: 'functions-web', codebase: 'web', runtime: 'nodejs22', ignore: ['node_modules', '*.test.js', '*.md'] }],
};

const routes = { region: REGION, functionId: FUNCTION_ID, proxies };
const files = {
  'firebase.json': JSON.stringify(firebase, null, 2) + '\n',
  'functions-web/routes.json': JSON.stringify(routes, null, 2) + '\n',
};

if (process.argv.includes('--check')) {
  const stale = Object.keys(files).filter((f) => !fs.existsSync(path.join(ROOT, f)) || fs.readFileSync(path.join(ROOT, f), 'utf8') !== files[f]);
  if (stale.length) { console.error('FAIL: out of date with vercel.json: ' + stale.join(', ') + '\n  run: node tools/firebase-config.js'); process.exit(1); }
  console.log('firebase config: matches vercel.json (' + proxies.length + ' store routes, ' + pageRewrites.length + ' page rewrites)');
} else {
  for (const [f, body] of Object.entries(files)) fs.writeFileSync(path.join(ROOT, f), body);
  console.log('wrote firebase.json and functions-web/routes.json (' + proxies.length + ' store routes, ' + pageRewrites.length + ' page rewrites)');
}
