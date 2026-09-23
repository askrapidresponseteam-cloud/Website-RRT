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
- `test_understanding.py` - spoken and typed queries (places, "near me", vets, shelters,
  cases, SOS, shop, misspellings) must resolve to the right result, every time.
- `test_voice.py`, `test_voice_local.py` - voice search with a simulated recogniser:
  live words, choosing among guesses, errors, Hindi, on-device vs browser recognition,
  and the shop's mic.

Query understanding (homepage, `index.html`): filler words are stripped, place names are
matched against a fixed list with aliases and spelling tolerance (add places in `PLACES`),
and a few intents (SOS, vet, shelters/rescuers, cases, report, shop, Ask the District)
pin one "Quick action" above the results. No model is involved; the same words always
give the same result.
- `check_centring.py /,/shop,/faq 1190 770` - every button and capsule on a page: label (or icon) must sit in the exact centre, measured on the rendered page.
