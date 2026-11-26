'use strict';
/* Pure helpers for webStoreProxy, kept apart so they can be tested without Firebase. */

const MAX_BODY = 64 * 1024;
const MAX_QUERY = 2048;

/**
 * Find the store URL for a request.
 * Returns { url } when a route matches and the method is allowed,
 * false when a route matches but the method is not allowed, null otherwise.
 */
function route(proxies, method, pathname, rawUrl) {
  if (typeof pathname !== 'string' || pathname.length > 512 || pathname.includes('..') || pathname.includes('\\')) return null;
  const q = String(rawUrl || '').indexOf('?');
  const search = q === -1 ? '' : String(rawUrl).slice(q);
  if (search.length > MAX_QUERY) return null;
  let methodBlocked = false;
  for (const p of proxies) {
    if (!pathname.startsWith(p.prefix + '/')) continue;
    const m = new RegExp(p.re).exec(pathname.slice(p.prefix.length));
    if (!m) continue;
    if (method !== 'OPTIONS' && !p.methods.includes(method)) { methodBlocked = true; continue; }
    if (method === 'OPTIONS' && !p.methods.includes('OPTIONS')) { methodBlocked = true; continue; }
    let url;
    try { url = p.dest.replace(/\$(\d)/g, (_, i) => encodeURIComponent(decodeURIComponent(m[Number(i)] || ''))); } catch (e) { return null; }
    const target = new URL(url);
    const fixed = new URL(p.dest.replace(/\$\d/g, 'x'));
    if (target.protocol !== 'https:' || target.host !== fixed.host) return null;
    return { url: target.origin + target.pathname + search };
  }
  return methodBlocked ? false : null;
}

/* Only these request headers reach the store. No cookies, no auth, no client IP. */
const PASS_REQUEST = ['accept', 'accept-language', 'content-type', 'user-agent', 'x-shopify-storefront-access-token'];
function upstreamHeaders(h) {
  const out = {};
  for (const k of PASS_REQUEST) if (h && typeof h[k] === 'string' && h[k].length < 1024) out[k] = h[k];
  if (!out.accept) out.accept = 'application/json';
  return out;
}

/* What goes back to the browser: the store's content type and status, never
 * its cookies; the same lock-down headers the Vercel proxy routes sent; and a
 * short shared cache for reads so repeat visits do not run the function. */
function responseHeaders(up, method) {
  const out = {
    'Content-Type': up.headers.get('content-type') || 'application/octet-stream',
    'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  };
  const ok = up.status >= 200 && up.status < 300;
  out['Cache-Control'] = (method === 'GET' || method === 'HEAD') && ok ? 'public, max-age=60, s-maxage=300' : 'no-store';
  const ra = up.headers.get('retry-after');
  if (ra && /^\d{1,4}$/.test(ra)) out['Retry-After'] = ra;
  return out;
}

module.exports = { route, upstreamHeaders, responseHeaders, MAX_BODY };
