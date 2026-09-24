"""Re-apply the site theme to any page that lost it.

Every public page carries the shared header, footer and theme between
<!-- rr:head -->, <!-- rr:header -->, <!-- rr:footer --> markers. A tool that
rewrites a page from an older copy can drop them, and the page falls back to
the old dark theme. This puts them back (it never touches the page's own
content or scripts) and exits 1 if it had to, so CI can commit the fix.

    python3 scripts/site-chrome/heal.py          # fix in place
    python3 scripts/site-chrome/heal.py --check  # report only
    python3 scripts/site-chrome/heal.py --force  # re-install on every page
                                                 # (after editing chrome.py)
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
from chrome import install, header, footer, strip_blocks  # noqa: E402

# page -> current nav item (pages with their own complete design are not listed:
# index.html is self-contained, app-demo.html is the phone mockup, about and
# how-it-works redirect to / in vercel.json)
CONTENT = {'faq.html': '/faq', 'know-the-laws.html': '/know-the-laws',
           'vet.html': '', 'app-guide.html': '', 'report/index.html': '', 'report/manage.html': ''}
PLAIN = {'preview.html': ''}   # shared chrome, own styling (no rr-theme.css)
SHOP = {'shop.html': ('shop', 'shop'), 'product.html': ('', 'product'), 'cart.html': ('', 'cart'),
        'saved.html': ('saved', 'saved'), 'track.html': ('track', 'track')}
ARROW = ('<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4.5 12h15M13.5 6l6 6-6 6" fill="none" '
         'stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>')
SHOPBAR = ('<!-- rr:shopbar -->\n<div class="shopbar">\n  <form class="hsearch find" role="search" autocomplete="off">\n'
           '    <input name="q" placeholder="Search food, medicines, brands\u2026" aria-label="Search the shop" inputmode="search" enterkeyhint="search">\n'
           '    <button type="submit" aria-label="Search">' + ARROW + '</button>\n    <div class="sugg" hidden></div>\n  </form>\n'
           '  <nav class="shopbar-links" aria-label="Your shop">\n    <a href="/shop"__shop__>All</a>\n'
           '    <a href="/shop/saved"__saved__>Saved</a>\n    <a href="/shop/track"__track__>Orders</a>\n  </nav>\n</div>\n'
           '<div class="sold-note">Sold and delivered by a third-party partner store \u00b7 payment on their secure checkout'
           '<span class="sn-more"> \u00b7 Rapid Response never sees your card</span></div>\n<!-- /rr:shopbar -->')

def complete(s):
    return all(m in s for m in ('<!-- rr:head -->', '<!-- rr:header -->', '<!-- rr:footer -->'))

def heal_shop(s, cur, page):
    s = strip_blocks(s)
    s = re.sub(r'<!-- rr:shopbar -->.*?<!-- /rr:shopbar -->\n?', '', s, flags=re.S)
    s = re.sub(r'<header class="site-header">.*?</header>\s*(<nav class="mobile-nav".*?</nav>\n?)?', '', s, flags=re.S)
    s = re.sub(r'<footer class="site-footer">.*?</footer>\n?', '', s, flags=re.S)
    s = re.sub(r'<link rel="stylesheet" href="https://fonts.googleapis.com/css2\?family=(Barlow|Material)[^>]*>\n?', '', s)
    s = s.replace('<link rel="stylesheet" href="/assets/shop.css">',
                  '<!-- rr:head --><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&display=swap">'
                  '<link rel="stylesheet" href="/assets/rr-site.css"><script src="/assets/rr-voice.js"></script><!-- /rr:head -->\n'
                  '<link rel="stylesheet" href="/assets/shop.css">', 1)
    bar = SHOPBAR
    for k in ('shop', 'saved', 'track'):
        bar = bar.replace('__%s__' % k, ' aria-current="page"' if k == cur else '')
    s = re.sub(r'<body[^>]*>\n?', lambda m: '<body data-page="%s">\n' % page + header('/shop', shop=True) + '\n' + bar + '\n', s, count=1)
    i = s.rfind('</body>')
    return s[:i] + footer() + '\n' + s[i:]

def main():
    check = '--check' in sys.argv
    force = '--force' in sys.argv
    fixed = []
    for group, theme in ((CONTENT, True), (PLAIN, False)):
        for rel, cur in group.items():
            p = os.path.join(ROOT, rel)
            if not os.path.exists(p): continue
            s = open(p, encoding='utf-8').read()
            if complete(s) and not force: continue
            new = install(s, current=cur, theme=theme)
            if new == s: continue
            fixed.append(rel)
            if not check: open(p, 'w', encoding='utf-8').write(new)
    for rel, (cur, page) in SHOP.items():
        p = os.path.join(ROOT, rel)
        if not os.path.exists(p): continue
        s = open(p, encoding='utf-8').read()
        if complete(s) and '<!-- rr:shopbar -->' in s and not force: continue
        new = heal_shop(s, cur, page)
        if new == s: continue
        fixed.append(rel)
        if not check: open(p, 'w', encoding='utf-8').write(new)
    if fixed:
        print(('missing theme: ' if check else 're-applied theme: ') + ', '.join(fixed))
        sys.exit(1)
    print('all pages carry the site theme')

if __name__ == '__main__':
    main()
