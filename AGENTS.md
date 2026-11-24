# Notes for anyone (or any tool) editing this site

**One theme, every page.** Each public page carries the shared header, footer
and theme between these markers. Keep them exactly as they are:

    <!-- rr:head --> ... <!-- /rr:head -->        (in <head>)
    <!-- rr:header --> ... <!-- /rr:header -->    (right after <body>)
    <!-- rr:footer --> ... <!-- /rr:footer -->    (right before </body>)
    <!-- rr:shopbar --> ... <!-- /rr:shopbar -->  (shop pages only)

- When you change a page, edit its content between those blocks. Never
  rebuild a page from an older copy: that drops the blocks and the page falls
  back to the retired dark theme.
- The old `<header>` / `<footer>` inside a page are hidden on purpose (their
  scripts still run). Do not "restore" them.
- The logo and header are identical on every page, the homepage included
  (its header is generated from the same file at build time). Never give a
  page its own header or logo, and never change their size or position.
- Header/footer markup lives in `scripts/site-chrome/chrome.py`. To change it
  site-wide, edit it there and run `python3 scripts/site-chrome/heal.py --force`;
  do not hand-edit one page.
- Styles: the blue site (24 Nov 2026). `assets/rr-blue.css` is linked LAST on
  every page (inside rr:head, and in a `<!-- rr:blue -->` block after
  shop.css on shop pages): it re-points the shared `--sg-*` tokens
  (`assets/rr-signal.css`) to the blue palette and settles what they do not
  reach. `assets/rr-site.css` is the header, the phone tab bar and sheet, and
  the footer. Look: cobalt (#1D3FC4) page openings (`.rr-band`, built by
  `scripts/site-chrome/band.py`) with a torn-paper edge, white and pale blue
  (#E4ECFF) sections, an indigo (#0E1A44) footer, marigold (#F6B43C, ink
  text) for the one main action on a view, blue for links, red (#B3261E) only
  for an SOS, errors and removing things. Headings in Bricolage, the interface
  in Manrope, Hindi in Noto Sans Devanagari. Rounded corners (12px controls,
  16-20px cards, pills for chips), sentence case, no mono labels.
  Flat: no tilted, 3D, lifted or shadowed tiles and buttons (owner, 24 Nov
  2026). Illustrations are `assets/rr-*-blue-{640,1080}.webp`.
- Phones (899px and narrower) work like an app: a compact top bar, a tab bar
  at the bottom (Home, Shop, Vet, Laws, More; Shop hides when the shop is
  off), the rest of the site in a sheet that slides up from More, and pages
  fetched before the tap lands (speculation rules, prefetch only). Keep content clear of the tab bar
  (body padding-bottom is set for it) and anything fixed at the bottom above
  it (`var(--rr-tabs-h)`).
- Never use long dashes (em or en) anywhere; use a plain hyphen.
- Fonts are served from this site (`assets/fonts/`, `assets/rr-fonts*.css`,
  built by `scripts/fonts/build_fonts.py`); never link Google Fonts again.
  Material Symbols is cut down to the icons the pages draw: a new icon name
  goes into `ICONS` in that script and the fonts are rebuilt, or the page
  shows the name spelled out.

**Build, security and third-party code.**

- Vercel runs `npm ci && npm run build` (`tools/build-site.js`) and serves the
  minified copy it writes to `dist/`. Always edit the readable source here;
  never commit `dist/` or `node_modules/`. `bash verify.sh` runs the same build
  and fails the deploy if a page would break. Preview the build with
  `npm run build && node scripts/dev-serve.js dist 8080`.
- Libraries are served from this site, pinned by version, under
  `assets/vendor/<name>-<version>/` (Firebase, jsPDF, lottie, React for the
  app demo). Never load a script from a CDN. To upgrade one, add a new
  versioned folder (the old one stays cached for a year) and change the pages.
- `vercel.json` sets the security headers for every page, and forwards only
  what each partner store's platform needs (see shared/store-vendors.json):
  a Shopify Online Store's feeds (`/st-api`, `/pl-api`, `/huft-api`,
  `/zg-api`: collection products, product .js, search suggest,
  recommendations), a headless Shopify store's Storefront API (`/pt-api`),
  a WooCommerce store's product and category reads (`/jd-api`, `/wk-api`, never its
  cart). A new partner store needs its own route plus an entry in
  `KNOWN_PROXIES` in `assets/rrt-shop.js` (route, store domain and platform
  must match); `scripts/check-storefront.js` fails the deploy otherwise.
- The right-click menu is switched off site-wide in `assets/rr-site.js` (text
  fields and a phone long-press keep theirs). Do not add per-page copies.

Check before pushing:

    python3 scripts/site-chrome/heal.py --check   # every page has the theme
    node scripts/check-storefront.js              # shop contract
    python3 scripts/site-chrome/check_logo.py     # logo pixel-identical on every page
    python3 scripts/fonts/build_fonts.py --check  # every icon a page draws is in its font

If a page does lose the theme, `.github/workflows/keep-theme.yml` puts it back
automatically after the push.
