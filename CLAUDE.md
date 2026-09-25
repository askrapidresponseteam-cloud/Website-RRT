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

Check before pushing:

    python3 scripts/site-chrome/heal.py --check   # every page has the theme
    node scripts/check-storefront.js              # shop contract
    python3 scripts/site-chrome/check_logo.py     # logo pixel-identical on every page
    python3 scripts/fonts/build_fonts.py --check  # every icon a page draws is in its font

If a page does lose the theme, `.github/workflows/keep-theme.yml` puts it back
automatically after the push.
