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
- Header/footer markup lives in `scripts/site-chrome/chrome.py`. To change it
  site-wide, edit it there and re-install; do not hand-edit one page.
- Styles: `assets/rr-site.css` (header/footer), `assets/rr-theme.css` (older
  content pages), `assets/shop.css` (shop). Do not reintroduce the old dark
  palette, Barlow/JetBrains fonts, or a red logo square.
- Never use long dashes (em or en) anywhere; use a plain hyphen.

Check before pushing:

    python3 scripts/site-chrome/heal.py --check   # every page has the theme
    node scripts/check-storefront.js              # shop contract

If a page does lose the theme, `.github/workflows/keep-theme.yml` puts it back
automatically after the push.
