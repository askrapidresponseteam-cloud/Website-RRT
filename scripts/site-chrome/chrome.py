"""Shared header/footer markup for every Rapid Response page, and the
transformer that installs it (idempotent: re-running replaces the old block)."""
import re

PAW = ('<svg class="rr-mark" viewBox="30 42 420 420" aria-hidden="true"><g fill="#434343"><circle cx="85" cy="193" r="45"/><circle cx="177" cy="107" r="45"/><circle cx="302" cy="107" r="45"/><circle cx="395" cy="193" r="45"/><path d="M378.5 348.1C381 351.2 384.7 354.5 386.7 357.8C388.7 361.1 389.5 364.5 390.7 368C391.9 371.5 393.3 375.2 394 378.9C394.6 382.5 394.6 386.1 394.5 389.7C394.5 393.3 394.5 397 393.9 400.5C393.2 404 391.9 407.4 390.6 410.7C389.2 414 387.6 417.2 385.7 420.2C383.8 423.2 381.5 426.1 378.9 428.6C376.4 431.2 373.6 433.6 370.5 435.6C367.3 437.6 364.1 439.6 360.1 440.7C356.1 441.7 350.8 441.6 346.3 441.8C341.8 441.9 337.5 442 333.2 441.8C328.9 441.6 324.5 440.9 320.6 440.6C316.7 440.3 313.2 440.1 309.8 439.8C306.4 439.4 303.2 439.2 300.1 438.8C296.9 438.3 293.7 437.4 290.8 436.9C287.9 436.4 285.2 436 282.6 435.6C280.1 435.2 277.6 434.8 275.3 434.5C273 434.2 270.7 434 268.6 433.8C266.5 433.7 264.5 433.8 262.4 433.6C260.4 433.5 258.3 433.1 256.4 433C254.4 432.8 252.6 432.9 250.7 432.9C248.8 432.9 246.9 433 245.1 432.9C243.2 432.9 241.4 432.6 239.5 432.6C237.7 432.6 235.8 432.9 234 432.9C232.1 433 230.2 432.9 228.4 432.9C226.5 432.9 224.6 432.8 222.6 433C220.7 433.1 218.6 433.5 216.6 433.6C214.6 433.8 212.6 433.7 210.4 433.8C208.3 434 206.1 434.2 203.7 434.5C201.4 434.8 199 435.2 196.4 435.6C193.8 436 191.2 436.4 188.3 436.9C185.4 437.4 182.1 438.3 179 438.8C175.8 439.2 172.6 439.4 169.2 439.8C165.8 440.1 162.3 440.3 158.4 440.6C154.5 440.9 150.1 441.6 145.8 441.8C141.5 442 137.2 442 132.7 441.8C128.3 441.5 123.4 441.4 119.3 440.4C115.3 439.3 111.8 437.6 108.6 435.6C105.3 433.7 102.6 431.2 100.1 428.6C97.5 426.1 95.3 423.2 93.3 420.2C91.4 417.2 89.8 414 88.5 410.7C87.1 407.4 85.8 404 85.2 400.5C84.5 397 84.5 393.3 84.5 389.7C84.5 386.1 84.4 382.5 85 378.9C85.7 375.2 87.1 371.5 88.3 368C89.5 364.5 90.4 361.1 92.3 357.8C94.3 354.5 97.5 351.2 100 348.1C102.5 345.1 105.1 342.2 107.3 339.5C109.5 336.7 110.9 334 113.1 331.5C115.3 329 118.1 326.7 120.3 324.4C122.6 322.1 124.5 320 126.5 317.8C128.4 315.7 130.2 313.6 132 311.6C133.9 309.6 135.7 307.8 137.4 305.8C139.1 303.9 140.7 302 142.2 300.1C143.7 298.2 145.1 296.3 146.4 294.4C147.7 292.4 148.7 290.2 150.1 288.4C151.6 286.6 153.6 285.1 155 283.3C156.4 281.4 157.3 279.1 158.7 277.2C160.1 275.4 162.1 274 163.5 272.1C164.9 270.2 166 267.9 167.3 265.8C168.6 263.7 169.9 261.3 171.3 259.3C172.8 257.2 174.5 255.3 176.2 253.3C177.8 251.3 179.6 249.4 181.3 247.2C183 245.1 184.6 242.6 186.4 240.5C188.3 238.4 190.4 236.7 192.4 234.5C194.5 232.3 196.3 229.5 198.5 227.4C200.7 225.3 203.2 223.8 205.7 222.1C208.2 220.4 210.8 218.5 213.5 217.2C216.2 215.9 219 215.1 221.9 214.3C224.7 213.5 227.7 212.8 230.6 212.4C233.6 212.1 236.5 212.1 239.5 212.1C242.5 212.1 245.5 212.1 248.4 212.4C251.3 212.8 254.3 213.5 257.1 214.3C260 215.1 262.9 215.9 265.6 217.2C268.2 218.5 270.8 220.4 273.3 222.1C275.8 223.8 278.3 225.3 280.5 227.4C282.7 229.5 284.6 232.3 286.6 234.5C288.6 236.7 290.6 238.5 292.6 240.5C294.5 242.5 296.6 244.2 298.3 246.4C300 248.5 301.3 251.2 302.8 253.3C304.4 255.5 306.2 257.3 307.7 259.3C309.2 261.3 310.6 263.4 312 265.4C313.5 267.4 314.8 269.4 316.2 271.4C317.6 273.4 319 275.3 320.3 277.2C321.6 279.2 322.6 281.4 324 283.3C325.4 285.1 327.5 286.6 328.9 288.4C330.3 290.2 331.3 292.4 332.6 294.4C333.9 296.3 335.3 298.2 336.8 300.1C338.3 302 340 303.9 341.6 305.8C343.2 307.8 344.7 309.8 346.5 311.8C348.3 313.8 350.5 315.7 352.5 317.8C354.6 319.9 356.4 322.1 358.7 324.4C360.9 326.7 363.7 329 365.9 331.5C368.1 334 369.6 336.7 371.7 339.5C373.8 342.2 376 345.1 378.5 348.1Z"/></g></svg>')

PLAY = 'https://play.google.com/store/apps/details?id=com.rrt.sos'
IOS = 'https://apps.apple.com/in/app/rapid-response/id6758672498'

def t(en, hi):
    return f'data-rr-en="{en}" data-rr-hi="{hi}">{en}'

NAV = [
    ('/talk-to-a-vet', 'Talk to a vet', 'वेट से बात करें', ''),
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
            f'<a class="rr-brand" href="/" aria-label="Rapid Response home">{PAW}<span>Rapid Response</span>{brand_tag}</a>'
            f'<nav class="rr-nav" aria-label="Main">{links}{right}</nav></div></div>\n<!-- /rr:header -->')

FOOT_LINKS = [
    ('/', 'Home', 'होम'), ('/talk-to-a-vet', 'Talk to a vet', 'वेट से बात करें'), ('/know-the-laws', 'Know the laws', 'कानून जानें'),
    ('/faq', 'FAQ', 'सवाल'), ('/report', 'On Record', 'ऑन रिकॉर्ड'), ('/shop', 'Shop', 'शॉप'), ('/vet', 'For vets', 'वेट के लिए'),
    ('/app-guide', 'App guide', 'ऐप गाइड'), ('mailto:ask@rapid-response.in', 'ask@rapid-response.in', 'ask@rapid-response.in'),
    ('https://www.instagram.com/rrtanimals', '@rrtanimals', '@rrtanimals'),
]

def footer(extra=''):
    links = ''.join(f'<a href="{h}" {t(en, hi)}</a>' for h, en, hi in FOOT_LINKS)
    return ('<!-- rr:footer -->\n<div class="rr-chrome rr-ftr" role="contentinfo">'
            '<span ' + t('\u00a9 2026 RapidResponse Labs \u00b7 Independent. Not affiliated with any government authority.',
                         '\u00a9 2026 रैपिड रिस्पॉन्स लैब्स \u00b7 स्वतंत्र। किसी सरकारी प्राधिकरण से संबद्ध नहीं।') + '</span>'
            + extra + f'<nav aria-label="Site">{links}</nav></div>\n<script src="/assets/rr-site.js" defer></script><script src="/assets/rr-center.js" defer></script>\n<!-- /rr:footer -->')

# Fonts are self-hosted (assets/fonts, @font-face rules in assets/rr-fonts*.css,
# built by scripts/fonts/build_fonts.py, which also rewrites the hashed names
# below). The files the header needs are preloaded so the page paints once, in
# its own fonts: Marcellus for the wordmark, Manrope 500 (body) and 800 (titles,
# buttons) for the Signal theme; Hindi readers (stored choice) also preload the
# Hindi weights (the header's labels are Noto 500 in Hindi, the app button 600).
def _preload(f):
    return f'<link rel="preload" href="/assets/fonts/{f}" as="font" type="font/woff2" crossorigin>'

HINDI_FONTS = ('noto-sans-devanagari-latin-400.1ea6a2f0.woff2', 'noto-sans-devanagari-latin-500.18745d03.woff2',
               'noto-sans-devanagari-devanagari-500.c9e45ff2.woff2', 'noto-sans-devanagari-devanagari-600.fcfcaacd.woff2')

def fonts(devanagari=True, hindi=True):
    """Preloads + the @font-face sheets. devanagari=False: the shop, which never loaded
    the Devanagari font. hindi=False: pages whose language switch does not work (app
    guide, remove-report), so Hindi readers see them in English."""
    s = _preload('marcellus-latin-400.8a539799.woff2')
    s += _preload('manrope-latin-500.19874318.woff2') + _preload('manrope-latin-800.74c161db.woff2')
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
