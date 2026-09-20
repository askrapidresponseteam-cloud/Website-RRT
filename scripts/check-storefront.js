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
 * Theme guard.
 *
 * The reference layout was a light, paper-white design. Only its geometry was
 * adopted; the palette and typefaces are Rapid Response's own. These checks stop
 * the reference's skin creeping back in via a copy-paste.
 * ------------------------------------------------------------------------- */

const LIGHT = [
  [/background:\s*#fff\b(?![^;]*accent)/i, 'white background'],
  [/#f7f7f5|#ececea|#faf9f7|#f7f6f4|#fafaf7/i, 'off-white wash'],
  [/color:\s*#(171717|222|444|666|999|bbb|ddd)\b/i, 'light-theme text colour'],
  [/Times New Roman/i, 'reference serif typeface'],
  [/font-family:\s*Arial/i, 'reference body typeface'],
  [/#0a0908|#ff4d3d/i, 'retired dark palette'],
];

for (const file of ['assets/shop.css', ...SHOP_PAGES]) {
  const s = fs.readFileSync(path.join(WEB, file), 'utf8');
  const hits = LIGHT.filter(([re]) => re.test(s)).map(([, name]) => name);
  if (hits.length) {
    console.log(`  FAIL  ${file}  -> design contract broken: ${hits.join('; ')}`);
    failed++;
  }
}

/* ---------------------------------------------------------------------------
 * Layout fidelity.
 *
 * The geometry IS the thing that was taken from the reference, so it is worth
 * asserting rather than assuming. If a future change drifts the grid, this says
 * so before it ships.
 * ------------------------------------------------------------------------- */

// The app's palette (client/lib/core/theme/app_theme.dart), required
// verbatim so phone and web can never drift apart.
const PALETTE = [
  [/#e52222/i, 'app red'],
  [/#111111/i, 'app black'],
  [/#ffffff/i, 'pure white ground'],
  [/#e2e2e2/i, 'app border grey'],
  [/#16a34a/i, 'app success green'],
];

const GEOMETRY = [
  // The header is the landing page's bar, so the logo sits at the exact
  // position it holds on the homepage: 60px tall (68px from 768px up),
  // 20/40px side padding. The grids below stay on the reference contract.
  [/\.site-header \{\s*\n\s*height:\s*60px/, 'landing header height 60px'],
  [/height:\s*68px/, 'landing header height 68px at 768px'],
  [/max\(40px, env\(safe-area-inset-left\)\)/, 'landing header 40px left offset'],
  [/width:\s*85%/, '85% content width'],
  [/grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/, 'four-column product grid'],
  [/column-gap:\s*26px/, '26px column gutter'],
  [/row-gap:\s*48px/, '48px row gutter'],
  [/aspect-ratio:\s*1 \/ 1/, 'square product images'],
  [/object-fit:\s*contain/, 'contain-fit images'],
  [/max-width:\s*1100px/, '1100px breakpoint'],
  [/max-width:\s*760px/, '760px breakpoint'],
  [/grid-template-columns:\s*repeat\(3, 1fr\)/, 'three columns at 1100px'],
  [/grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/, 'two columns at 760px'],
];

const cssOnly = fs.readFileSync(path.join(WEB, 'assets', 'shop.css'), 'utf8');
const missingColours = PALETTE.filter(([re]) => !re.test(cssOnly)).map(([, name]) => name);
if (missingColours.length) {
  console.log(`  FAIL  app palette drifted -> missing: ${missingColours.join('; ')}`);
  failed++;
} else {
  console.log(`  ok    app palette intact (${PALETTE.length} colour checks)`);
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

console.log(failed ? `\n${failed} check(s) failed.\n` : '\nAll storefront checks pass.\n');
process.exit(failed ? 1 : 0);
