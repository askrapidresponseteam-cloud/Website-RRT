"""Shared header/footer markup for every Rapid Response page, and the
transformer that installs it (idempotent: re-running replaces the old block)."""
import re

PAW = ('<svg class="rr-mark" viewBox="30 42 420 420" aria-hidden="true"><g fill="#434343"><circle cx="85" cy="193" r="45"/><circle cx="177" cy="107" r="45"/><circle cx="302" cy="107" r="45"/><circle cx="395" cy="193" r="45"/><path d="M227 213 L217 216 L211 219 L206 222 L202 225 L199 228 L196 231 L193 234 L190 237 L188 240 L185 243 L183 246 L180 249 L178 252 L176 255 L173 258 L171 261 L169 264 L167 267 L165 270 L163 273 L161 276 L158 279 L156 282 L154 285 L152 288 L150 291 L148 294 L146 297 L143 300 L141 303 L138 306 L136 309 L133 312 L130 315 L127 318 L124 321 L122 324 L119 327 L116 330 L113 333 L110 336 L108 339 L106 342 L103 345 L101 348 L98 351 L96 354 L94 357 L92 360 L91 363 L89 366 L88 369 L87 372 L87 375 L86 378 L86 381 L85 384 L85 387 L85 390 L85 393 L85 396 L86 399 L86 402 L87 405 L88 408 L89 411 L90 414 L92 417 L94 420 L96 423 L98 426 L101 429 L104 432 L108 435 L114 438 L124 441 L124 441 L89 412 L94 422 L99 428 L104 433 L109 436 L114 439 L119 441 L124 442 L129 442 L134 442 L139 442 L144 442 L149 442 L154 442 L159 441 L164 441 L169 440 L174 440 L179 439 L184 438 L189 437 L194 436 L199 436 L204 435 L209 434 L214 434 L219 434 L224 433 L229 433 L234 433 L239 433 L244 433 L249 433 L254 433 L259 434 L264 434 L269 434 L274 435 L279 435 L284 436 L289 437 L294 438 L299 439 L304 439 L309 440 L314 441 L319 441 L324 441 L329 442 L334 442 L339 442 L344 442 L349 442 L354 442 L359 441 L364 439 L369 437 L374 433 L379 429 L384 423 L389 415 L357 441 L357 441 L366 438 L372 435 L376 432 L379 429 L382 426 L384 423 L386 420 L388 417 L390 414 L391 411 L392 408 L393 405 L394 402 L394 399 L395 396 L395 393 L395 390 L395 387 L395 384 L394 381 L394 378 L393 375 L393 372 L392 369 L391 366 L389 363 L388 360 L386 357 L384 354 L382 351 L379 348 L377 345 L374 342 L372 339 L370 336 L367 333 L364 330 L361 327 L358 324 L356 321 L353 318 L350 315 L347 312 L344 309 L342 306 L339 303 L337 300 L335 297 L332 294 L330 291 L328 288 L326 285 L324 282 L322 279 L320 276 L317 273 L315 270 L313 267 L312 264 L310 261 L307 258 L305 255 L302 252 L300 249 L298 246 L295 243 L293 240 L290 237 L287 234 L284 231 L281 228 L278 225 L274 222 L269 219 L263 216 L253 213Z"/></g></svg>')

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
            + extra + f'<nav aria-label="Site">{links}</nav></div>\n<script src="/assets/rr-site.js" defer></script><script src="/assets/rr-center.js" defer></script>\n<!-- /rr:footer -->')

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
