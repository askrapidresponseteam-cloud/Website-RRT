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
- Styles: `assets/rr-signal.css` (the theme tokens, `--sg-*`, see
  `docs/SIGNAL-THEME.md`: light ground, red signal; linked first from every
  rr:head block), `assets/rr-site.css` (header/footer), `assets/rr-theme.css`
  (older content pages), `assets/shop.css` (shop). Map new styles onto the
  `--sg-*` tokens: white ground, square corners (every radius token is 0),
  hairlines not shadows, Archivo (`--sg-display`) for headings and button
  labels, one red (`--sg-accent`, white text) per view for the primary action
  (red also for errors, destructive actions and emergencies). Do not
  reintroduce the old dark palette, Barlow/JetBrains fonts, rounded pills, the
  yellow of the earlier theme, or a red logo square: the paw and the
  Marcellus wordmark stay as they are, and Marcellus is only for the wordmark
  in the header.
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
