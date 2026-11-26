'use strict';
/**
 * webStoreProxy: the partner-store proxy for rapid-response.in on Firebase Hosting.
 *
 * The shop reads public product feeds from partner stores (Shopify and
 * WooCommerce). Browsers cannot call those stores directly (no CORS), so the
 * site calls its own paths (/st-api/..., /jd-api/...) and this function fetches
 * the matching store URL. Vercel did this with external rewrites; Firebase
 * Hosting cannot, so Hosting sends those paths here instead.
 *
 * Only the exact routes in routes.json (generated from vercel.json by
 * tools/firebase-config.js) are forwarded, each to the one store it names.
 * Nothing else: no open proxy, no cookies either way, no credentials, a small
 * POST size cap (POST only for the one Storefront GraphQL route), and a hard
 * instance cap so a traffic spike can never run up a bill.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { route, upstreamHeaders, responseHeaders, MAX_BODY } = require('./proxy');
const ROUTES = require('./routes.json');

exports[ROUTES.functionId] = onRequest(
  {
    region: ROUTES.region,
    memory: '256MiB',
    timeoutSeconds: 20,
    maxInstances: 3,
    concurrency: 80,
    invoker: 'public',
  },
  async (req, res) => {
    const hit = route(ROUTES.proxies, req.method, req.path, req.url);
    if (!hit) { res.set('Cache-Control', 'no-store'); res.status(hit === null ? 404 : 405).send(''); return; }
    if (req.method === 'OPTIONS') { res.set('Cache-Control', 'no-store'); res.status(204).send(''); return; }

    let body;
    if (req.method === 'POST') {
      const raw = req.rawBody || Buffer.alloc(0);
      if (raw.length > MAX_BODY) { res.status(413).send(''); return; }
      body = raw;
    }

    const target = new URL(hit.url);
    const base = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.RRT_PROXY_TEST_UPSTREAM;
    const fetchUrl = base ? base + target.pathname + target.search + (target.search ? '&' : '?') + '_host=' + target.host : hit.url;

    let up;
    try {
      up = await fetch(fetchUrl, {
        method: req.method,
        headers: upstreamHeaders(req.headers),
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) {
      res.set('Cache-Control', 'no-store');
      res.status(502).send('');
      return;
    }
    // A redirect that left the store's own site is refused.
    if (!base && new URL(up.url).host !== target.host) { res.set('Cache-Control', 'no-store'); res.status(502).send(''); return; }

    const buf = Buffer.from(await up.arrayBuffer());
    res.set(responseHeaders(up, req.method));
    res.status(up.status).send(req.method === 'HEAD' ? '' : buf);
  }
);
