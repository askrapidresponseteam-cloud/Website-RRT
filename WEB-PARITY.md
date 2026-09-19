# Web ↔ app parity

*September 2026. This document describes the storefront as it now is. It
supersedes `ARCHITECTURE.md`, `PARTNER-INTEGRATION-SPEC.md` and the
`firebase/` middle layer, which are kept as history.*

The web shop is now built the way the RRT app's SHOP tab is built - and the
app's shop is **live and shipping orders**, so this is a port of something
proven, not a second invention.

The principle, from the app's `STORE_IMPLEMENTATION.md`:

> A skin over the vendor's live store, read directly from the phone.
> No RRT server sits in the path. Money is integer paise, parsed from text.
> Anything that decides money is read fresh. Checkout is a hand-off to the
> vendor's own secure page, carrying an RRT reference the backend ledger
> counts.

Replace "phone" with "browser" and that is this repo.

---

## Integration into Website-RRT (this repo)

The shop ships inside the main site, deployed together on Vercel:

| Piece | Where |
|---|---|
| Shop pages | `shop.html`, `product.html`, `cart.html`, `shop-return.html`, `track.html`, `saved.html` at the repo root |
| Shop assets | `assets/shop.css`, `assets/rrt-shop.js`, `assets/shop-ui.js` (alongside the site's images; no name collisions) |
| Routing | `vercel.json` rewrites: `/shop/p/:handle` → product, `/shop/cart·saved·return·track` → their pages, `/shop/:path*` → hub; `cleanUrls` serves `/shop` itself |
| Entry points | Hero nav and footer Explore link on the homepage (bilingual, using the site's `data-lang` mechanism), footer links on FAQ / laws / legal-desk / report pages, and a bilingual shop strip above the homepage footer |
| SEO | `/shop` added to `sitemap.xml`; cart, orders, receipts and product pages carry `noindex` |
| Dev tooling | `scripts/test-storefront-client.js` (101 assertions) and `scripts/check-storefront.js`, excluded from deploys via `.vercelignore`; the checker scans only the six shop pages, since the landing pages have a light mode and no seller to disclose |

The landing site and the shop share the same design tokens (`--bg:#0a0908`,
`--accent:#ff4d3d`, Barlow / Barlow Condensed / JetBrains Mono), so the shop
reads as native. One deliberate difference: the landing has a light-mode
toggle; the shop stays dark - it is its own skin, and the checker enforces
that no light theme leaks into it. The homepage shop strip, styled with the
site's own variables, does follow the light mode.

---

## The one architectural decision

The old repo put a Firebase Functions middle layer between the browser and an
**invented, anonymous** partner API. Nothing behind it existed; `GO-LIVE.md`
said so. Meanwhile the app had already answered every question the middle
layer was invented to solve - by not having one:

| Question | Old repo's answer | The app's answer (now the web's) |
|---|---|---|
| Where does catalogue data come from? | Proxy + cache in Functions | The vendor's live Shopify store, read by the client |
| Who is the partner? | Secret; anonymous by design | **Pets Lifestyle**, named on every page |
| How are prices kept honest? | Cache rules in the proxy | Money-deciding reads are always fresh; 3-minute cache for browsing only |
| How does checkout work? | Invented `/checkout` API | Shopify cart permalink to the vendor's own secure checkout |
| How are RRT orders counted? | Invented webhook contract | The **real, running** Shopify webhook → `store_orders.js` ledger in the app's backend, matching `rrt_ref` |
| What does RRT store server-side? | An attribution ledger here | Nothing here at all - the ledger already exists in the app's backend |

**Naming the partner is a deliberate reversal.** The old repo's anonymity
rule ("the partner is never named… their identity lives only in runtime
secrets") was self-defeating: consumer-protection rules require the seller of
record to be identifiable to the buyer, and `GO-LIVE.md` carried that as an
unresolved legal blocker. The app ships with the vendor named in its
disclosure screen, in support links and in policy links. The web now does the
same, and `scripts/check-storefront.js` **fails any page that does not name
the seller** - the exact inverse of the rule it used to enforce.

---

## The transport difference (and why it exists)

The app reads the vendor's `/collections/{handle}/products.json` and
`/products/{handle}.js` endpoints. Those endpoints send no CORS headers, so a
browser on an RRT domain cannot fetch them. This is the one place the web
cannot copy the app literally.

The web instead uses **Shopify's tokenless Storefront API** - the same
GraphQL endpoint (`https://08e8df.myshopify.com/api/2026-01/graphql.json`)
the app itself already uses for full search, which Shopify serves CORS-open
precisely so storefront clients can call it. Tokenless access covers
products, collections, search and recommendations: the identical live data
through a different door. No token is issued, so there is no key to embed,
rotate or leak, and a retired API version keeps answering as the oldest
supported one.

Two fields (`tags`, `quantityRule`) sit at the edge of tokenless access
depending on shop configuration. The client tries them once, falls back to a
lean query on a GraphQL error, and remembers (`rrt_sf_caps_v1`), so a
misconfigured shop degrades one label, never a page.

---

## File-by-file mapping

| App (Dart, live) | Web (this repo) |
|---|---|
| `core/store/vendor.dart` - vendor constants, 10 shelves / 71 aisles | `web/assets/rrt-shop.js` - `Vendor`, `SHELVES` (verbatim) |
| `core/models/store_models.dart` - paise money, text parsing, veg/Rx rules, description blocks, cart/receipt models | `web/assets/rrt-shop.js` - same functions, same regexes, same expected values in tests |
| `core/services/vendor_storefront.dart` - live reads, 3-min cache, 20 s timeout, exact error copy | `web/assets/rrt-shop.js` - `gql()` + `collectionPage`/`product`/`suggest`/`searchAll`/`recommendations` |
| `core/services/store_actions.dart` - cart ops, revalidation, `startVendorCheckout`, `rrt_ref` | `web/assets/rrt-shop.js` - `add`/`revalidateCart`/`beginCheckout`/`newRrtRef` |
| `store_hub_view` / `store_shelf_view` / `store_search_view` | `web/shop.html` |
| `store_product_view` | `web/product.html` |
| `store_cart_view` | `web/cart.html` |
| post-checkout receipt sheet | `web/shop-return.html` |
| `store_orders_view` + delete-my-data | `web/track.html` |
| saved shelf | `web/saved.html` |
| `test/store_models_test.dart` | `scripts/test-storefront-client.js` - 101 assertions, shared expected values |

Rules ported exactly: whole-word veg/non-veg/Rx regexes ("shampoo" is not
ham, "delivery" is not liver, a plush duck is not a duck); compare-at ≤ price
is noise, not a sale; a price range never gets a strikethrough; `Default
Title` means no option picker; absent `availableForSale` means sellable;
vendor `quantityRule.maximum` caps the stepper, else 99; receipts cap at 50,
saved at 200; the vendor's exact error copy on timeout/429/junk responses.

## Attribution - how web orders get counted

Nothing new was built, because the counting already runs in production for
the apps. The web joins it:

1. `beginCheckout` mints `RRT-XXXXXXXXXX` (crypto-random, same 31-character
   alphabet as the app) and builds the vendor cart permalink
   `https://www.pets-lifestyle.com/cart/{variantId}:{qty},…` with
   `attributes[rrt_ref]`, `attributes[source]=RRT website` and `ref=rrt-web`
   (the app sends `RRT app` / `rrt-app`).
2. The buyer pays on the vendor's checkout. The attributes ride on the order
   into the vendor's Shopify admin.
3. The vendor's Shopify fires the already-configured webhook to the app
   repo's `backend/functions/store_orders.js`, which matches `rrt_ref` and
   writes the ledger the RRT Admin reads (see the app repo's
   `STORE_ORDER_TRACKING.md`).

So web orders appear in the same admin count, split from app orders by the
`source` attribute. **No deployment step in this repo touches counting.**

## Honest differences from the app

- **Sorting is server-side.** The app loads a whole aisle from the JSON feed
  and sorts on the phone; the Storefront API sorts in the query
  (`COLLECTION_DEFAULT` / `CREATED` / `PRICE`), so the web pages 24 at a time
  already ordered. Same four options, same results, less transfer.
- **The web cannot watch the vendor's checkout.** The app opens checkout in
  an in-app browser and sees the thank-you page, so it confirms receipts
  itself. A browser hand-off is a navigation; when the buyer returns, the
  bag and orders pages ask one question - *"Did you place the order?"* - and
  keep or drop the pending receipt. Unanswered hand-offs expire after 7
  days. The authoritative count never depended on this either way (it comes
  from the webhook, step 3 above); receipts are a courtesy record on the
  device, exactly as in the app.
- **No profile prefill.** The app passes the signed-in user's name and phone
  to checkout. The web has no signed-in user; `checkoutUrl` supports the
  same documented prefill parameters if a caller has them, but pages do not
  ask. The vendor's checkout collects the address either way, and browsers
  autofill.
- **UPI needs no bridge.** The app intercepts `upi://` intents inside its
  WebView; a browser hands them to the OS natively.

## What RRT runs and stores

Hosting for six static pages and two script files. That is all. No
functions, no database, no secrets, no keys. The browser stores the bag,
saved items and receipts locally (`rrt_store_*`), with **DELETE MY SHOP
DATA** on the orders page clearing all of it - the same promise the app's
delete-my-data makes.

## Verification

Run locally:

```bash
node scripts/test-storefront-client.js   # 101 assertions, app-shared values
node scripts/check-storefront.js         # pages ↔ SDK ↔ theme ↔ disclosure
```

Against the live vendor (needs open internet; the build sandbox for this
rewrite allowed neither the vendor's domain nor the Storefront API, so **live
calls were not executed here** - the app's endpoints were last verified live
on 17 Sep 2026, and the search query is the app's known-good one verbatim):

1. Serve `web/` (`npx serve web` or `firebase emulators:start`), open
   `/shop`. The grid must fill from the live catalogue.
2. Open an aisle, sort by price, filter in-stock, search a brand.
3. Add a paisa-priced product (anything at ₹xxx.19) - the bag must show it
   to the paisa.
4. Press checkout, and on the vendor page confirm the items, the note that
   attributes carried over, and the final total including delivery.
5. Place the cheapest real order. Within minutes it must appear in the app
   backend's ledger with `source: RRT website` - that is the whole
   attribution chain, proven end to end.
6. Come back, answer "I placed my order", and see the receipt under
   `/shop/track`.

## Transport (updated 19 Sep 2026)

Production showed the risk of leaning on the Storefront API alone: tokenless
GraphQL answered the catalogue with an empty collection while the live store
listed 10,000+ products. The web now reads the vendor the way the app does.

- `vercel.json` rewrites `/pl-api/*` to `https://www.pets-lifestyle.com/*`,
  giving the browser a same-origin door to the app's exact endpoints (their
  feeds send no CORS headers, so this proxy is what makes them readable).
- Primary reads are the app's: `/products/{handle}.js` (product + cart
  re-check), `/search/suggest.json` (search-as-you-type), and
  `/recommendations/products.json`, each with the Storefront API as fallback.
- Listings ask the Storefront API first (its sort is server-side) and switch
  to `/collections/{handle}/products.json` for the session the moment the
  API errors or returns an empty catalogue page. On feeds, an aisle loads
  whole (up to 1000 items) so client-side sort is complete - the app's own
  behaviour - and the catalogue pages 24 at a time on a `fp:N` cursor.

If pets-lifestyle.com shows it, /shop shows it.

The same deploy fixed the shop's routes outright. With `cleanUrls` on, Vercel
strips `.html` from the build output before rewrites run, so every rewrite
destination naming a file (`/cart.html`) resolved to nothing: `/shop/cart`,
`/shop/p/{handle}` and every aisle URL answered Vercel's 404 - the first
routes on this site that ever actually needed a rewrite, since `/shop` itself
is served by `cleanUrls` directly. Destinations are now extensionless
(`/cart`), the shape Vercel's configuration docs require alongside
`cleanUrls`. The `/pl-api/*` proxy is unaffected either way: external
destinations bypass the static output entirely.
