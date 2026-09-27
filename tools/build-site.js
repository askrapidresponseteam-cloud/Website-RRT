#!/usr/bin/env node
'use strict';
/**
 * Build rapid-response.in for Vercel: every public file is copied into dist/,
 * with HTML, CSS and JavaScript minified. Vercel runs this (vercel.json:
 * buildCommand, outputDirectory) and serves dist/ only.
 *
 * The source in this folder stays readable on purpose: heal.py and the
 * keep-theme workflow edit it, and people review it. Never commit dist/.
 *
 *   npm ci && npm run build        (what Vercel and verify.sh run)
 *
 * What is minified, and what is deliberately left alone:
 *   - HTML: comments removed, whitespace collapsed conservatively (never to
 *     nothing, so spacing between inline elements is unchanged; <pre> and
 *     <textarea> keep theirs), inline <style> and <script> minified.
 *     Attribute values, entities, tag and attribute case are kept as written.
 *   - JavaScript (files and inline scripts): Terser, local names only. Names
 *     at the top level are never renamed or dropped, because pages call them
 *     from onclick="..." attributes and from each other's scripts. Inline
 *     event handlers are left as written.
 *   - Left as they are: the vendored libraries (assets/vendor, already
 *     minified releases), *.min.js, scripts that are already minified or
 *     obfuscated (re-minifying obfuscated code can break its self-checks),
 *     data scripts (JSON-LD, the app demo's bundle), images, fonts, video.
 *
 * The build then checks its own output and fails (so nothing half-built is
 * ever served; Vercel keeps the previous deployment) if:
 *   - a public file is missing from dist/,
 *   - a page lost or gained a <script>, <link> or <iframe> tag,
 *   - any script in dist/ (file or inline) no longer compiles.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { minify: minifyHtml } = require('html-minifier-terser');
const { minify: terser } = require('terser');
const CleanCSS = require('clean-css');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, process.env.RRT_WEB_OUT || 'dist');

// Never published: tooling, tests, notes for editors, dependencies.
// (.vercelignore keeps most of these out of the upload as well.)
const SKIP_DIRS = new Set(['node_modules', 'dist', 'tools', 'scripts', '.github', '.git', '.vercel', '__pycache__']);
const SKIP_FILES = new Set(['package.json', 'package-lock.json', 'vercel.json', '.vercelignore', '.gitignore', '.DS_Store']);
const SKIP_EXT = new Set(['.md', '.py', '.pyc']);
const VENDOR_DIR = path.join('assets', 'vendor') + path.sep;

const TERSER = {
  compress: {},             // Terser's safe defaults (no "unsafe" transforms)
  mangle: true,             // local names only (toplevel is off by default)
  format: { comments: /@license|@preserve|^!/ },
};
const CSS = new CleanCSS({ level: 1, returnPromise: false });

const warnings = [];

function isObfuscated(code) {
  const m = code.match(/\b_0x[0-9a-f]{4,}\b/g);
  return !!m && m.length > 20;
}
function isAlreadyMinified(code) {
  const lines = code.split('\n').filter((l) => l.trim());
  if (code.length < 2000 || !lines.length) return false;
  return code.length / lines.length > 500;
}

async function js(code, label) {
  if (isObfuscated(code) || isAlreadyMinified(code)) return code;
  try {
    const r = await terser(code, TERSER);
    return typeof r.code === 'string' ? r.code : code;
  } catch (e) {
    // Leave it exactly as written rather than guess: the build still checks
    // that it compiles below.
    warnings.push(`${label}: kept unminified (${e.message})`);
    return code;
  }
}

function css(text, label) {
  const r = CSS.minify(text);
  if (r.errors && r.errors.length) throw new Error(`${label}: ${r.errors.join('; ')}`);
  return r.styles;
}

async function html(text, label) {
  return minifyHtml(text, {
    collapseWhitespace: true,
    conservativeCollapse: true,
    removeComments: true,
    caseSensitive: true,
    keepClosingSlash: true,     // <path /> inside inline SVG must stay self-closed
    removeAttributeQuotes: true,
    collapseBooleanAttributes: true,   // defer="" and defer="defer" both become defer
    decodeEntities: false,
    minifyCSS: { level: 1 },
    // Inline <script> bodies only; event handler attributes stay as written.
    minifyJS: (code, inline) => (inline ? code : js(code, `${label} <script>`)),
    continueOnParseError: false,
  });
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    const rel = path.relative(ROOT, abs);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || abs === OUT) continue;
      walk(abs, out);
    } else if (e.isFile()) {
      // Licence and notice files of the vendored libraries ship with them.
      const vendorDoc = rel.startsWith(VENDOR_DIR);
      if (SKIP_FILES.has(e.name) || (!vendorDoc && SKIP_EXT.has(path.extname(e.name)))) continue;
      out.push(rel);
    }
  }
  return out;
}

// ---- checks on the output ---------------------------------------------------
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
function tagCounts(s) {
  const body = stripComments(s);
  const n = (re) => (body.match(re) || []).length;
  return { script: n(/<script\b/gi), link: n(/<link\b/gi), iframe: n(/<iframe\b/gi) };
}
function compiles(code, label) {
  try { new vm.Script(code, { filename: label }); return null; } catch (e) { return `${label}: ${e.message}`; }
}
function inlineScripts(s) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(s))) {
    const attrs = m[1];
    if (/\bsrc\s*=/.test(attrs)) continue;
    const type = (/\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs) || [])[1];
    if (type && !/^(text|application)\/(java|ecma)script$/i.test(type)) continue;   // data blocks
    out.push(m[2]);
  }
  return out;
}

async function main() {
  const t0 = Date.now();
  fs.rmSync(OUT, { recursive: true, force: true });
  const files = walk(ROOT);
  let before = 0; let after = 0;
  const problems = [];

  for (const rel of files) {
    const src = path.join(ROOT, rel);
    const dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const ext = path.extname(rel).toLowerCase();
    const raw = fs.readFileSync(src);
    before += raw.length;
    let out = raw;
    const untouched = rel.startsWith(VENDOR_DIR) || rel.endsWith('.min.js');
    if (!untouched && ext === '.html') {
      const text = raw.toString('utf8');
      const min = await html(text, rel);
      const a = tagCounts(text); const b = tagCounts(min);
      if (a.script !== b.script || a.link !== b.link || a.iframe !== b.iframe) {
        problems.push(`${rel}: tags changed by minifying (before ${JSON.stringify(a)}, after ${JSON.stringify(b)})`);
      }
      out = Buffer.from(min, 'utf8');
    } else if (!untouched && ext === '.js') {
      out = Buffer.from(await js(raw.toString('utf8'), rel), 'utf8');
    } else if (!untouched && ext === '.css') {
      out = Buffer.from(css(raw.toString('utf8'), rel), 'utf8');
    }
    fs.writeFileSync(dst, out);
    after += out.length;
  }

  // Every public file made it, and every script still compiles.
  for (const rel of files) {
    const dst = path.join(OUT, rel);
    if (!fs.existsSync(dst)) { problems.push(`${rel}: missing from ${path.basename(OUT)}/`); continue; }
    const ext = path.extname(rel).toLowerCase();
    if (ext === '.js') {
      const p = compiles(fs.readFileSync(dst, 'utf8'), rel);
      if (p) problems.push(p);
    } else if (ext === '.html') {
      inlineScripts(fs.readFileSync(dst, 'utf8')).forEach((code, i) => {
        const p = compiles(code, `${rel} inline script ${i + 1}`);
        if (p) problems.push(p);
      });
    }
  }

  for (const w of warnings) console.warn('  note: ' + w);
  if (problems.length) {
    console.error(`\nWebsite build FAILED (${problems.length} problem(s)):`);
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`Website built: ${files.length} files, ${kb(before)} -> ${kb(after)} in ${path.basename(OUT)}/ (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}

main().catch((e) => { console.error('Website build FAILED:', e && e.stack ? e.stack : e); process.exit(1); });
