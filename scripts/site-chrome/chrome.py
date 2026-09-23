"""Shared header/footer markup for every Rapid Response page, and the
transformer that installs it (idempotent: re-running replaces the old block)."""
import re

PAW = ('<svg class="rr-mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="#ff4d3d"/>'
       '<g fill="#fff"><ellipse cx="25.5" cy="33.5" rx="6.8" ry="9.3"/><ellipse cx="43.5" cy="27.5" rx="7.3" ry="10"/>'
       '<ellipse cx="63.5" cy="31" rx="7" ry="9.6"/><ellipse cx="79" cy="43" rx="6" ry="8.3"/>'
       '<ellipse cx="50" cy="68.3" rx="25.5" ry="16.3"/><ellipse cx="50" cy="60" rx="20" ry="12"/></g></svg>')

PLAY = 'https://play.google.com/store/apps/details?id=com.rrt.sos'
IOS = 'https://apps.apple.com/in/app/rapid-response/id6758672498'

def t(en, hi):
    return f'data-rr-en="{en}" data-rr-hi="{hi}">{en}'

NAV = [
    ('/know-the-laws', 'Know the laws', 'कानून जानें', ''),
    ('/legal-desk', 'Legal Desk', 'लीगल डेस्क', 'rr-opt'),
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
                 '<a href="/app-guide" ' + t('See every screen first', 'पहले हर स्क्रीन देखें') + '</a></div></div>')
    return ('<!-- rr:header -->\n<div class="rr-chrome rr-hdr" role="banner"><div class="rr-hdr-in">'
            f'<a class="rr-brand" href="/" aria-label="Rapid Response home">{PAW}<span>Rapid Response</span>{brand_tag}</a>'
            f'<nav class="rr-nav" aria-label="Main">{links}{right}</nav></div></div>\n<!-- /rr:header -->')

FOOT_LINKS = [
    ('/', 'Home', 'होम'), ('/know-the-laws', 'Know the laws', 'कानून जानें'), ('/legal-desk', 'Legal Desk', 'लीगल डेस्क'),
    ('/faq', 'FAQ', 'सवाल'), ('/report', 'On Record', 'ऑन रिकॉर्ड'), ('/shop', 'Shop', 'शॉप'), ('/vet', 'For vets', 'वेट के लिए'),
    ('/app-guide', 'App guide', 'ऐप गाइड'), ('mailto:ask@rapid-response.in', 'ask@rapid-response.in', 'ask@rapid-response.in'),
    ('https://www.instagram.com/rrtanimals', '@rrtanimals', '@rrtanimals'),
]

def footer(extra=''):
    links = ''.join(f'<a href="{h}" {t(en, hi)}</a>' for h, en, hi in FOOT_LINKS)
    return ('<!-- rr:footer -->\n<div class="rr-chrome rr-ftr" role="contentinfo">'
            '<span ' + t('\u00a9 2026 RapidResponse Labs \u00b7 Independent. Not affiliated with any government authority.',
                         '\u00a9 2026 रैपिड रिस्पॉन्स लैब्स \u00b7 स्वतंत्र। किसी सरकारी प्राधिकरण से संबद्ध नहीं।') + '</span>'
            + extra + f'<nav aria-label="Site">{links}</nav></div>\n<script src="/assets/rr-site.js" defer></script>\n<!-- /rr:footer -->')

FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=Noto+Sans+Devanagari:wght@400;500;600&display=swap">')

EARLY = ("<script>/* rr: one light theme site-wide */try{['rr-mode','theme'].forEach(function(k){localStorage.setItem(k,'l')});}catch(e){}"
         "document.documentElement.classList.add('light','rr-themed');</script>")

def head_block(theme=True):
    css = '<link rel="stylesheet" href="/assets/rr-site.css">' + ('<link rel="stylesheet" href="/assets/rr-theme.css">' if theme else '')
    return '<!-- rr:head -->' + FONTS + css + (EARLY if theme else '') + '<!-- /rr:head -->'

def strip_blocks(s):
    for tag in ('head', 'header', 'footer'):
        s = re.sub(r'\n?<!-- rr:%s -->.*?<!-- /rr:%s -->\n?' % (tag, tag), '', s, flags=re.S)
    return s

def install(s, current='', theme=True, shop=False, foot_extra=''):
    s = strip_blocks(s)
    s = s.replace('</head>', head_block(theme) + '</head>', 1)
    s = re.sub(r'(<body[^>]*>)', lambda m: m.group(1) + '\n' + header(current, shop), s, count=1)
    i = s.rfind('</body>')
    s = s[:i] + footer(foot_extra) + '\n' + s[i:]
    return s
