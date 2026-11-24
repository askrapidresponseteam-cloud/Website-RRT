"""Give a page the blue site's opening: its eyebrow, title and lead (the
.rr-ph-eye, .rr-ph-h1 and .rr-ph-lead elements) move into a cobalt band
with a torn-paper edge, right under the header, with an illustration on
some pages. Run once per page (24 Nov 2026); a page that already has a band
is left alone. (The network page keeps its own head: its map fills the
screen beside the figures.) The elements keep their classes, ids and both languages, so
the page's own language switch and scripts still reach them.

    python3 scripts/site-chrome/band.py            # every page listed below
"""
import os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

ART = {
    'vet': ('rr-vet-blue', 'A vet on a call beside a resting community dog, cut from blue paper'),
    'community': ('rr-community-blue', 'Two people walking with a community dog and cat, cut from blue paper'),
    'shop': ('rr-shop-blue', 'A woman with a dog, a cat and everyday care supplies, cut from blue paper'),
}
PAGES = {
    'faq.html': None, 'talk-to-a-vet.html': 'vet', 'vet.html': 'vet',
    'explainer.html': None, 'invite.html': 'community', 'lab-animal-rules.html': None,
    'policy.html': None, 'vet-terms.html': None, 'know-the-laws.html': None,
}

def take(s, cls):
    """Cut the first element whose class list holds `cls`; return (s, html)."""
    m = re.search(r'<([a-zA-Z0-9]+)\b[^>]*\bclass=("[^"]*\b%s\b[^"]*"|[^\s>"]*\b%s\b[^\s>"]*)[^>]*>' % (cls, cls), s)
    if not m:
        return s, ''
    tag = m.group(1).lower()
    i, depth, pos = m.start(), 0, m.start()
    opener = re.compile(r'<(/?)%s\b[^>]*?(/?)>' % tag, re.I)
    for t in opener.finditer(s, pos):
        if t.group(1):
            depth -= 1
        elif not t.group(2):
            depth += 1
        if depth == 0:
            j = t.end()
            return s[:i] + s[j:], s[i:j]
    return s, ''

def take_all(s, cls):
    """Every element with `cls` that sits right after the previous one taken
    (a page carries the title twice, once per language: both move)."""
    s, first = take(s, cls)
    out = [first] if first else []
    while first:
        nxt = re.search(r'<([a-zA-Z0-9]+)\b[^>]*\bclass=("[^"]*\b%s\b[^"]*"|[^\s>"]*\b%s\b[^\s>"]*)' % (cls, cls), s)
        if not nxt:
            break
        s2, more = take(s, cls)
        if not more:
            break
        s, first = s2, more
        out.append(more)
    return s, ''.join(out)

def band(s, art):
    if '<!-- rr:band -->' in s:
        return s
    s, eye = take_all(s, 'rr-ph-eye')
    s, h1 = take_all(s, 'rr-ph-h1')
    s, lead = take_all(s, 'rr-ph-lead')
    if not h1:
        return s
    pic = ''
    if art:
        name, alt = ART[art]
        pic = ('<picture class="rr-band-pic"><source media="(max-width:899px)" srcset="/assets/%s-640.webp">'
               '<img class="rr-band-art" src="/assets/%s-1080.webp" alt="%s" width="1080" height="720" fetchpriority="high"></picture>' % (name, name, alt))
    grid = 'rr-band-grid' + ('' if art else ' rr-solo')
    html = ('<!-- rr:band -->\n<section class="rr-band"><div class="%s"><div class="rr-band-copy">%s%s%s</div>%s</div></section>\n<!-- /rr:band -->\n'
            % (grid, eye, h1, lead, pic))
    k = s.find('<!-- /rr:header -->')
    k = s.find('\n', k) + 1
    return s[:k] + html + s[k:]

def main():
    for rel, art in PAGES.items():
        p = os.path.join(ROOT, rel)
        s = open(p, encoding='utf-8').read()
        new = band(s, art)
        if new != s:
            open(p, 'w', encoding='utf-8').write(new)
            print('band:', rel)

if __name__ == '__main__':
    main()
