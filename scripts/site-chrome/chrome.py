"""Shared header/footer markup for every Rapid Response page, and the
transformer that installs it (idempotent: re-running replaces the old block)."""
import re

PAW = ('<svg class="rr-mark" viewBox="0 0 40 40" aria-hidden="true"><g fill="currentColor">'
       '<ellipse cx="9" cy="14" rx="4.8" ry="6.2" transform="rotate(-25 9 14)"/><ellipse cx="18" cy="8" rx="4.5" ry="6"/>'
       '<ellipse cx="28" cy="10" rx="4.5" ry="6" transform="rotate(18 28 10)"/><ellipse cx="35" cy="19" rx="4.3" ry="5.7" transform="rotate(30 35 19)"/>'
       '<path d="M11 27c3-4 5-10 10-10s7 6 10 10c6 9-3 12-10 8-8 4-16 0-10-8"/></g></svg>')

PLAY = 'https://play.google.com/store/apps/details?id=com.rrt.sos'
IOS = 'https://apps.apple.com/in/app/rapid-response/id6758672498'

def t(en, hi):
    return f'data-rr-en="{en}" data-rr-hi="{hi}">{en}'

NAV = [
    ('/vet', 'Join as a vet', 'वेट बनकर जुड़ें', ''),
    ('/know-the-laws', 'Know the laws', 'कानून जानें', ''),
    ('/faq', 'FAQ', 'सवाल', ''),
    ('/shop', 'Shop', 'शॉप', 'rr-opt'),
]

def header(current='', shop=False):
    links = ''
    for href, en, hi, cls in NAV:
        cur = ' aria-current="page"' if current == href else ''
        c = f' class="{cls}"' if cls else ''
        links += f'<a href="{href}"{c}{cur} {t(en, hi)}</a>'
    brand_tag = '<small>Shop</small>' if shop else ''
    right = ''
    if shop:
        right = ('<a class="rr-bag" href="/shop/cart" aria-label="Bag">'
                 '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">'
                 '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>'
                 '<b id="bagCount" hidden>0</b></a>')
    else:
        right = ('<div class="rr-lang" role="group" aria-label="Language"><button data-l="en" aria-pressed="true">EN</button>'
                 '<span class="rr-sep">|</span><button data-l="hi" aria-pressed="false">हिंदी</button></div>'
                 '<div class="rr-cta"><button class="rr-btn rr-dark" id="rrAppBtn" aria-haspopup="true" aria-expanded="false" '
                 + t('Get the app', 'ऐप पाएँ') + '</button>'
                 f'<div class="rr-menu" id="rrAppMenu"><a href="{PLAY}" rel="noopener">Android - Google Play</a>'
                 f'<a href="{IOS}" rel="noopener">iPhone - App Store</a>'
                 '<a href="/preview" ' + t('See every screen first', 'पहले हर स्क्रीन देखें') + '</a></div></div>')
    return ('<!-- rr:header -->\n<div class="rr-chrome rr-hdr" role="banner"><div class="rr-hdr-in">'
            f'<a class="rr-brand" href="/" aria-label="Rapid Response home">{PAW}<span>Rapid<br>Response</span>{brand_tag}</a>'
            f'<nav class="rr-nav" aria-label="Main">{links}{right}</nav></div></div>\n<!-- /rr:header -->')

# Two tiers: the few links most visitors want, then everything else in a
# quieter second row, so the footer never reads as a wall of links.
FOOT_LINKS = [
    ('/explainer', 'The app, explained', 'ऐप, आसान शब्दों में'),
    ('/vet', 'Join as a vet', 'वेट बनकर जुड़ें'), ('/know-the-laws', 'Know the laws', 'कानून जानें'),
    ('/shop', 'Shop', 'शॉप'), ('/faq', 'FAQ', 'सवाल'),
    ('mailto:ask@rapid-response.in', 'Contact', 'संपर्क'),
]
FOOT_MORE = [
    ('/talk-to-a-vet', 'Talk to a vet', 'वेट से बात करें'), ('/app-guide', 'App guide', 'ऐप गाइड'),
    ('/policy', 'Terms &amp; Privacy', 'शर्तें और प्राइवेसी'), ('/vet-terms', 'Vet terms', 'वेट शर्तें'),
    ('https://www.instagram.com/rrtanimals', '@rrtanimals', '@rrtanimals'),
]

def footer(extra=''):
    links = ''.join(f'<a href="{h}" {t(en, hi)}</a>' for h, en, hi in FOOT_LINKS)
    more = ''.join(f'<a href="{h}" {t(en, hi)}</a>' for h, en, hi in FOOT_MORE)
    return ('<!-- rr:footer -->\n<div class="rr-chrome rr-ftr" role="contentinfo">'
            f'<div class="rr-ftr-top"><a class="rr-brand" href="/" aria-label="Rapid Response home">{PAW}<span>Rapid<br>Response</span></a>'
            f'<nav aria-label="Site">{links}</nav></div>'
            + extra + f'<nav class="rr-ftr2" aria-label="More">{more}</nav>'
            '<span class="rr-ftr-copy" ' + t('\u00a9 2026 RapidResponse Labs \u00b7 Independent community network. Not affiliated with any government authority.',
                         '\u00a9 2026 रैपिड रिस्पॉन्स लैब्स \u00b7 स्वतंत्र सामुदायिक नेटवर्क। किसी सरकारी प्राधिकरण से संबद्ध नहीं।') + '</span>'
            '</div>\n<script src="/assets/rr-site.js" defer></script><script src="/assets/rr-center.js" defer></script>\n<!-- /rr:footer -->')

# Fonts are self-hosted (assets/fonts, @font-face rules in assets/rr-fonts*.css,
# built by scripts/fonts/build_fonts.py, which also rewrites the hashed names
# below). The files the header needs are preloaded so the page paints once, in
# its own fonts. The theme's type is Arial (on every device), so only Hindi is
# preloaded: Hindi readers (stored choice) also preload the
# Hindi weights (the header's labels are Noto 500 in Hindi, the app button 600).
def _preload(f):
    return f'<link rel="preload" href="/assets/fonts/{f}" as="font" type="font/woff2" crossorigin>'

HINDI_FONTS = ('noto-sans-devanagari-latin-400.1ea6a2f0.woff2', 'noto-sans-devanagari-latin-500.18745d03.woff2',
               'noto-sans-devanagari-devanagari-500.c9e45ff2.woff2', 'noto-sans-devanagari-devanagari-600.fcfcaacd.woff2')

def fonts(devanagari=True, hindi=True):
    """Preloads + the @font-face sheets. devanagari=False: the shop, which never loaded
    the Devanagari font. hindi=False: pages whose language switch does not work (app
    guide, remove-report), so Hindi readers see them in English."""
    s = ''
    if devanagari:
        s += _preload('noto-sans-devanagari-devanagari-400.f86f14cb.woff2')  # the header's "हिंदी"
        if hindi:
            s += ("<script>/* rr: Hindi fonts before first paint */try{if((localStorage.getItem('lang')||localStorage.getItem('rr-lang'))==='hi')"
                  + '[' + ','.join("'%s'" % f for f in HINDI_FONTS) + "].forEach(function(f){var l=document.createElement('link');"
                  "l.rel='preload';l.as='font';l.type='font/woff2';l.crossOrigin='anonymous';l.href='/assets/fonts/'+f;document.head.appendChild(l)})}catch(e){}</script>")
    s += '<link rel="stylesheet" href="/assets/rr-fonts.css">'
    if devanagari:
        s += '<link rel="stylesheet" href="/assets/rr-fonts-devanagari.css">'
    return s

FONTS = fonts()  # index.html carries this same block in its <head> (heal.py does not install the homepage)

EARLY = ("<script>/* rr: one light theme site-wide */try{['rr-mode','theme'].forEach(function(k){localStorage.setItem(k,'l')});}catch(e){}"
         "document.documentElement.classList.add('light','rr-themed');</script>")

# Signal tokens (assets/rr-signal.css) come first; every other sheet maps onto them.
SIGNAL = '<link rel="stylesheet" href="/assets/rr-signal.css">'

def head_block(theme=True, hindi=True):
    css = SIGNAL + '<link rel="stylesheet" href="/assets/rr-site.css">' + ('<link rel="stylesheet" href="/assets/rr-theme.css">' if theme else '')
    return '<!-- rr:head -->' + fonts(True, hindi) + css + (EARLY if theme else '') + '<!-- /rr:head -->'

def bilingual(s):
    """True if the page's language switch works (rr-site.js hides it otherwise), so a
    Hindi reader gets the page in Hindi and its Hindi fonts are worth preloading."""
    return bool(re.search(r'function setLang\b|\bsetLang\s*=|data-lang=["\']?hi\b', s))

def strip_blocks(s):
    """Remove every installed block (and the one newline install() adds after it)."""
    for tag in ('head', 'header', 'footer'):
        s = re.sub(r'<!-- rr:%s -->.*?<!-- /rr:%s -->\n?' % (tag, tag), '', s, flags=re.S)
    return s

def install(s, current='', theme=True, shop=False, foot_extra=''):
    """Idempotent: install(install(x)) == install(x)."""
    s = strip_blocks(s)
    s = s.replace('</head>', head_block(theme, bilingual(s)) + '\n</head>', 1)
    s = re.sub(r'(<body[^>]*>)\n?', lambda m: m.group(1) + '\n' + header(current, shop) + '\n', s, count=1)
    i = s.rfind('</body>')
    return s[:i] + footer(foot_extra) + '\n' + s[i:]
