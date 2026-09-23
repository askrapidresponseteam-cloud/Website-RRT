# Site chrome and checks

- `chrome.py` - the shared header, footer and logo markup every page carries
  (between `<!-- rr:header -->` / `<!-- rr:footer -->` markers). Edit here, then
  re-install on a page with `install(html, current='/faq')`; it replaces the old block.
- `../dev-serve.js` - local Vercel emulator (cleanUrls, rewrites, redirects):
  `node scripts/dev-serve.js . 8080`
- `mock.py` - fake vendor catalogue for offline testing (the proxy and Storefront API
  are answered in their real formats).
- `e2e_shop.py 1440 900 d` - browse, infinite scroll, add, stepper, search, shelf, brand,
  product options, buy now, delivery form, hand-off to the seller's checkout.
- `crawl.py` - every link on every page must resolve.
- `contrast.py /faq,/shop` - flags text that is too faint for its background.

Needs `pip install playwright && playwright install chromium` and the dev server on :8080.
