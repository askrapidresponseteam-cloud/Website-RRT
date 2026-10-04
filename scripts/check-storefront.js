#!/usr/bin/env node
/**
 * Storefront consistency check. Run before every deploy.
 *
 * Exists because each of these has already broken at least once during build:
 * a regex ate two style blocks and left documents that swallowed themselves;
 * a page called SDK methods that had been renamed; and a reference mock's
 * branding was carried over wholesale from a layout that was only meant to
 * supply the layout.
 */
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..');
// Only the shop's own pages: the landing pages around them have a light
// mode and no seller disclosure, by design. Served copy never names the vendor.
const SHOP_PAGES = ['shop.html', 'product.html', 'cart.html',
  'track.html', 'saved.html'];
const css = fs.readFileSync(path.join(WEB, 'assets', 'shop.css'), 'utf8');
const sdk = fs.readFileSync(path.join(WEB, 'assets', 'rrt-shop.js'), 'utf8');
const ui = fs.readFileSync(path.join(WEB, 'assets', 'shop-ui.js'), 'utf8');

const vars = new Set([...css.matchAll(/^\s*(--[a-z-]+):/gm)].map((m) => m[1]));

/** The names exported between the PUBLIC API sentinels of [source]. Parsing
 *  the marked block, rather than guessing shapes, means a renamed export
 *  fails here before a page can call the old name in production. */
function publicApi(source, file) {
  const m = source.match(/PUBLIC API \*\/([\s\S]*?)\/\* END PUBLIC API/);
  if (!m) throw new Error(`no PUBLIC API sentinels in ${file}`);
  return new Set([...m[1].matchAll(/^\s{4}(\w+):/gm)].map((x) => x[1]));
}
const methods = publicApi(sdk, 'rrt-shop.js');
const uiMethods = publicApi(ui, 'shop-ui.js');

// Collapse whitespace so a brand name split across a line break still counts.
const flat = (s) => s.replace(/\s+/g, ' ');

let failed = 0;

for (const file of SHOP_PAGES) {
  const s = fs.readFileSync(path.join(WEB, file), 'utf8');
  const f = flat(s);
  const problems = [];

  const missingVars = [...new Set([...s.matchAll(/var\((--[a-z-]+)\)/g)].map((m) => m[1]))]
    .filter((v) => !vars.has(v));
  if (missingVars.length) problems.push(`undefined CSS vars: ${missingVars}`);

  const missingCalls = [...new Set([...s.matchAll(/RRTShop\.(\w+)/g)].map((m) => m[1]))]
    .filter((m) => !methods.has(m) && m !== '__internal');
  if (missingCalls.length) problems.push(`SDK methods do not exist: ${missingCalls}`);

  const missingUi = [...new Set([...s.matchAll(/RRTUI\.(\w+)/g)].map((m) => m[1]))]
    .filter((m) => !uiMethods.has(m));
  if (missingUi.length) problems.push(`UI helpers do not exist: ${missingUi}`);

  for (const tag of ['style', 'script', 'html', 'body', 'head', 'main', 'footer']) {
    const open = (s.match(new RegExp(`<${tag}[ >]`, 'g')) || []).length;
    const close = (s.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) problems.push(`<${tag}> unbalanced ${open}/${close}`);
  }

  if (!s.includes('assets/shop.css')) problems.push('not using the shared stylesheet');

  // House style: no em dashes, anywhere, ever.
  if (s.includes(String.fromCharCode(0x2014))) problems.push('em dash in shipped text');
  if (s.indexOf('\\' + 'u2014') !== -1) problems.push('escaped em dash in shipped text');

  // Branding. The layout came from a mock belonging to another organisation;
  // none of their identity may ship.
  if (/PFA|People For Animals/i.test(f)) problems.push('FOREIGN BRANDING PRESENT');
  if (!/Rapid Response/.test(f)) problems.push('no Rapid Response branding');

  // Live data: nothing priced or pictured may be baked into markup.
  if (/₹\s*\d/.test(s)) problems.push('hardcoded price in markup');
  // Anchored to URLs so the `placeholder=` input attribute is not a false match.
  const hotlink = /https?:\/\/[^"' ]*(unsplash|placehold\.|placeholder\.com|lorempixel|picsum)/i;
  if (hotlink.test(s)) problems.push('placeholder image hotlink');

  // Every customer-facing page must carry the seller disclosure. The seller
  // is NAMED, as in the app - an anonymous "retail partner" is the one thing
  // the superseded architecture required that consumer-protection rules on
  // seller identity would not survive.
  if (/Pets\s+Lifestyle/i.test(f)) problems.push('vendor named in served copy');
  if (!/third-party/i.test(f)) problems.push('missing third-party seller disclosure');
  const fullDisclosure = !/robots.*noindex/.test(s) ||
    file === 'track.html' || file === 'cart.html';
  if (fullDisclosure && !/(sold and delivered by|seller for every|takes? payment)/i.test(f)) {
    problems.push('missing seller disclosure');
  }

  console.log(`${problems.length ? '  FAIL  ' : '  ok    '}${file}` +
    (problems.length ? `  -> ${problems.join('; ')}` : ''));
  if (problems.length) failed++;
}

/* ---------------------------------------------------------------------------
 * Design contract (September 2026): the shop wears Signal, the one theme of
 * the app, the website and the admin (docs/SIGNAL-THEME.md): mist page,
 * paper cards, ink type in Manrope, one yellow action per view, the shared
 * site header and footer (assets/rr-site.css), and red (Stop) reserved for
 * errors. These checks stop the retired dark skin and its typefaces creeping
 * back.
 * ------------------------------------------------------------------------- */

const RETIRED = [
  [/#0a0908/i, 'retired dark ground'],
  [/Barlow/i, 'retired Barlow typeface'],
  [/JetBrains/i, 'retired mono typeface'],
  [/class="site-header"/, 'retired shop-only header'],
];
for (const file of ['assets/shop.css', ...SHOP_PAGES]) {
  const s = fs.readFileSync(path.join(WEB, file), 'utf8');
  const hits = RETIRED.filter(([re]) => re.test(s)).map(([, name]) => name);
  if (hits.length) {
    console.log(`  FAIL  ${file}  -> design contract broken: ${hits.join('; ')}`);
    failed++;
  }
}
for (const file of SHOP_PAGES) {
  const s = fs.readFileSync(path.join(WEB, file), 'utf8');
  const miss = [];
  if (!s.includes('/assets/rr-site.css')) miss.push('shared chrome stylesheet');
  if (!s.includes('<!-- rr:header -->')) miss.push('shared header');
  if (!s.includes('<!-- rr:footer -->')) miss.push('shared footer');
  if (!s.includes('class="hsearch find"')) miss.push('shop search');
  if (!s.includes('id="bagCount"')) miss.push('bag count');
  if (miss.length) { console.log(`  FAIL  ${file}  -> missing ${miss.join('; ')}`); failed++; }
}

// Theme tokens (assets/rr-signal.css, 2.18.0: light ground, red signal);
// shop.css maps onto them and keeps each value as the fallback, so the
// palette is checkable here.
const PALETTE = [
  [/#0D0D0F/i, 'ink'],
  [/#ffffff/i, 'paper (the ground)'],
  [/#F5F4F2/i, 'mist surface'],
  [/#D81E2C/i, 'signal red (the one primary action; also errors)'],
  [/#A2131B/i, 'deep red (pressed, links, error text)'],
  [/#E4E2DE/i, 'line'],
  [/Archivo/, 'display face (titles, prices, button labels)'],
  [/Manrope/, 'interface face'],
];

const GEOMETRY = [
  [/grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/, 'five-column product grid'],
  [/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/, 'four columns at 1400px'],
  [/grid-template-columns:\s*repeat\(3, 1fr\)/, 'three columns at 1100px'],
  [/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'two columns at 760px'],
  [/aspect-ratio:\s*1 \/ 1/, 'square product images'],
  [/object-fit:\s*contain/, 'contain-fit images'],
  [/\.bagbar/, 'quick-checkout bag bar'],
  [/position:\s*sticky; top:\s*var\(--hdr\)/, 'sticky shop search bar'],
];

const cssOnly = fs.readFileSync(path.join(WEB, 'assets', 'shop.css'), 'utf8');
const missingColours = PALETTE.filter(([re]) => !re.test(cssOnly)).map(([, name]) => name);
if (missingColours.length) {
  console.log(`  FAIL  palette drifted -> missing: ${missingColours.join('; ')}`);
  failed++;
} else {
  console.log(`  ok    palette intact (${PALETTE.length} checks)`);
}
const lost = GEOMETRY.filter(([re]) => !re.test(cssOnly)).map(([, name]) => name);
if (lost.length) {
  console.log(`  FAIL  layout contract drifted -> missing: ${lost.join('; ')}`);
  failed++;
} else {
  console.log(`  ok    layout contract intact (${GEOMETRY.length} geometry checks)`);
}

for (const [name, text] of [['shop.css', cssOnly], ['rrt-shop.js', sdk], ['shop-ui.js', ui]]) {
  if (text.includes(String.fromCharCode(0x2014))) {
    console.log(`  FAIL  assets/${name}: em dash in shipped text`);
    failed++;
  }
}

// Every store in the registry must be fully wired on the website, or a
// backend switch to it silently falls back to the bundle default (exactly
// the half-switched state this check exists to prevent): its proxy route in
// rrt-shop.js KNOWN_PROXIES (same store, same platform), the vercel.json
// rewrites its platform reads through, the sandboxed response headers on the
// route, and the store domain in the CSP report-only connect-src.
//   shopify_public    the four feeds: collection products, product .js,
//                     search suggest, recommendations
//   shopify_headless  the store's Storefront API (POST /api/:version/graphql.json)
//   woocommerce       the Store API's product and category reads, and never
//                     the cart (a buyer's cart is their session on their site)
{
  const path = require('path');
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'shared', 'store-vendors.json'), 'utf8'));
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const rewrites = (vercel.rewrites || []).map((r) => r.source);
  const destOf = {}; (vercel.rewrites || []).forEach((r) => { destOf[r.source] = r.destination; });
  const headerSrcs = (vercel.headers || []).map((h) => h.source);
  const cspRO = ((vercel.headers || []).find((h) => h.source === '/:path*') || { headers: [] })
    .headers.filter((x) => x.key === 'Content-Security-Policy-Report-Only').map((x) => x.value).join(' ');
  for (const id of Object.keys(registry.vendors)) {
    const d = registry.vendors[id];
    const base = d.web && d.web.proxyBase;
    const problems = [];
    if (!base) problems.push('no web.proxyBase');
    else {
      const km = new RegExp("'" + base + "'\\s*:\\s*\\{\\s*platform:\\s*'" + d.platform + "',\\s*domain:\\s*'" + d.domain.replace(/\./g, '\\.') + "'");
      if (!km.test(sdk)) problems.push(`${base} (${d.platform}, ${d.domain}) missing from rrt-shop.js KNOWN_PROXIES`);
      const mine = rewrites.filter((r) => r.startsWith(base + '/'));
      // Every route of this store forwards to this store and nowhere else.
      for (const r of mine) {
        if (!String(destOf[r] || '').startsWith('https://' + d.domain + '/')) problems.push(`vercel.json ${r} does not forward to https://${d.domain}/`);
      }
      if (d.platform === 'shopify_public') {
        for (const ep of ['/collections/:handle/products.json', '/search/suggest.json', '/recommendations/products.json']) {
          if (!rewrites.includes(base + ep)) problems.push(`vercel.json rewrite missing: ${base}${ep}`);
        }
        if (!mine.some((r) => r.startsWith(base + '/products/'))) problems.push(`vercel.json rewrite missing: ${base}/products/:file`);
      } else if (d.platform === 'shopify_headless') {
        if (!mine.some((r) => /\/api\/:version[^/]*\/graphql\.json$/.test(r))) problems.push(`vercel.json rewrite missing: ${base}/api/:version/graphql.json`);
        if (mine.some((r) => /collections|suggest|recommendations|\/products\//.test(r))) problems.push(`${base}: a headless store has no feeds to forward`);
      } else if (d.platform === 'woocommerce') {
        const api = d.woo && d.woo.api;
        for (const ep of ['/products', '/products/categories']) {
          if (!rewrites.includes(base + api + ep)) problems.push(`vercel.json rewrite missing: ${base}${api}${ep}`);
        }
        if (mine.some((r) => /cart|checkout|:path\*/.test(r))) problems.push(`${base}: only product and category reads may be forwarded`);
      } else {
        problems.push(`unknown platform ${d.platform}`);
      }
      if (!headerSrcs.includes(base + '/:path*')) problems.push(`vercel.json headers missing for ${base}/:path*`);
      if (!cspRO.includes('https://' + d.domain)) problems.push(`CSP report-only connect-src missing https://${d.domain}`);
      if (d.storefrontApi && d.platform === 'shopify_public' && !cspRO.includes('https://' + d.storefrontApi.host)) {
        problems.push(`CSP report-only connect-src missing https://${d.storefrontApi.host} (Storefront API)`);
      }
    }
    if (problems.length) { console.log(`  FAIL  store '${id}' not fully wired -> ` + problems.join('; ')); failed++; }
    else console.log(`  ok    store '${id}' (${d.platform}) fully wired (proxy, rewrites, headers, CSP)`);
  }
}

console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll storefront checks pass.\n');
process.exit(failed ? 1 : 0);
