#!/usr/bin/env python3
"""Self-hosted web fonts (assets/fonts/). No page loads fonts from Google.

Text fonts are copied unchanged from the npm @fontsource packages (the same
static cuts Google Fonts serves): Manrope (the Signal interface face, latin +
latin-ext, 400/500/600/700/800; latin-ext carries the rupee sign U+20B9),
IBM Plex Mono (Signal data labels, latin + latin-ext, 400/500), Marcellus
(latin, the brand wordmark in the header only) and Noto Sans Devanagari
(latin + devanagari, 400/500/600/700, Hindi text). Material Symbols Outlined is
cut down to the icons the pages draw (ICONS below) and pinned to the axis
settings each page used when it loaded the font from Google.

Rebuild (fonttools + brotli; install the npm packages in a scratch dir, never in apps/web):
    npm i --prefix /tmp/webfonts @fontsource/manrope @fontsource/ibm-plex-mono @fontsource/marcellus @fontsource/noto-sans-devanagari material-symbols
    pip install fonttools brotli
    python3 scripts/fonts/build_fonts.py /tmp/webfonts/node_modules
Check that every icon a page draws is in its icon font (fonttools only):
    python3 scripts/fonts/build_fonts.py --check

Adding an icon to a page: add its name to the right list in ICONS and rebuild,
or the page shows the icon's name spelled out instead of the icon (--check
catches names written in a page's markup; names a script builds must be listed
by hand, as below).

/assets/fonts/* is served with a one-year immutable cache (vercel.json), so every
file name carries a hash of its content. A rebuild writes the new names into the
stylesheets, chrome.py and the pages.
"""
import glob, hashlib, os, re, shutil, sys

WEB = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(WEB, 'assets', 'fonts')

TEXT = {  # output base name -> file in node_modules
    **{'manrope-%s-%d' % (s, w): '@fontsource/manrope/files/manrope-%s-%d-normal.woff2' % (s, w)
       for s in ('latin', 'latin-ext') for w in (400, 500, 600, 700, 800)},
    **{'ibm-plex-mono-%s-%d' % (s, w): '@fontsource/ibm-plex-mono/files/ibm-plex-mono-%s-%d-normal.woff2' % (s, w)
       for s in ('latin', 'latin-ext') for w in (400, 500)},
    'marcellus-latin-400': '@fontsource/marcellus/files/marcellus-latin-400-normal.woff2',
    **{'noto-sans-devanagari-%s-%d' % (s, w): '@fontsource/noto-sans-devanagari/files/noto-sans-devanagari-%s-%d-normal.woff2' % (s, w)
       for s in ('latin', 'devanagari') for w in (400, 500, 600, 700)},
}
LICENSES = {
    'OFL-Manrope.txt': '@fontsource/manrope/LICENSE',
    'OFL-IBMPlexMono.txt': '@fontsource/ibm-plex-mono/LICENSE',
    'OFL-Marcellus.txt': '@fontsource/marcellus/LICENSE',
    'OFL-NotoSansDevanagari.txt': '@fontsource/noto-sans-devanagari/LICENSE',
    'LICENSE-MaterialSymbols.txt': 'material-symbols/LICENSE',
}
ICON_SRC = 'material-symbols/material-symbols-outlined.woff2'

# Every icon name a page can draw, including the ones its scripts build
# (report: category icons, toasts, media errors, toggles; vet: status cards).
_REPORT = '''add add_to_photos android arrow_forward broken_image campaign category chat check check_circle
  chevron_left chevron_right close description download error heart_broken history home_work hourglass_top info
  inventory_2 link local_fire_department local_shipping location_off location_on location_searching lock mail
  medical_services movie movie_off my_location pets phone_iphone photo_camera play_arrow play_circle remove report
  schedule science search share swap_horiz tag videocam visibility_off volume_off volume_up volunteer_activism'''
ICONS = {
    # Google css2 "Material+Symbols+Outlined:wght,FILL@400,0": static, optical size 24, grade 0
    'material-symbols-outlined': {
        'axes': {'wght': 400, 'FILL': 0, 'GRAD': 0, 'opsz': 24},
        'pages': ['faq.html', 'know-the-laws.html', 'report/index.html', 'report/manage.html'],
        'names': sorted(set(_REPORT.split() + 'pets search print unfold_more unfold_less delete'.split())),
    },
    # vet.html asked for the whole variable font and sets FILL 0 / wght 400 itself; the
    # optical size follows the icon's font-size (font-optical-sizing:auto), so opsz stays variable
    'material-symbols-outlined-opsz': {
        'axes': {'wght': 400, 'FILL': 0, 'GRAD': 0},
        'pages': ['vet.html'],
        'names': sorted('account_circle arrow_forward block check check_circle edit help hourglass_top pets upload verified wifi_off'.split()),
    },
    # app-guide.html: "opsz,wght,FILL,GRAD@24,500,1,0"
    'material-symbols-outlined-fill': {
        'axes': {'wght': 500, 'FILL': 1, 'GRAD': 0, 'opsz': 24},
        'pages': ['app-guide.html'],
        'names': ['pets'],
    },
}
REF_FILES = ['assets/*.css', '*.html', 'report/*.html', 'scripts/site-chrome/chrome.py']


def lig_subtables(font):
    gsub = font['GSUB'].table
    for lookup in gsub.LookupList.Lookup:
        for st in lookup.SubTable:
            st = getattr(st, 'ExtSubTable', st)
            if st.LookupType == 4:
                yield st


def glyph_chars(font):
    g2c = {}
    for cp, gn in sorted(font.getBestCmap().items()):
        c = chr(cp)
        if gn not in g2c or c.islower() or c.isdigit() or c == '_':
            g2c[gn] = c
    return g2c


def ligature_names(font):
    g2c = glyph_chars(font)
    names = {}
    for st in lig_subtables(font):
        for first, ligs in st.ligatures.items():
            for lg in ligs:
                try:
                    names[''.join(g2c[g] for g in [first] + lg.Component).lower()] = lg.LigGlyph
                except KeyError:
                    pass
    return names


def build_icons(src, names, axes):
    from fontTools.ttLib import TTFont
    from fontTools.varLib import instancer
    from fontTools import subset
    import io
    buf = io.BytesIO()
    inst = instancer.instantiateVariableFont(TTFont(src, recalcTimestamp=False), axes)
    inst.recalcTimestamp = False  # same input, same bytes, same file name
    inst.save(buf)
    buf.seek(0)
    font = TTFont(buf, recalcTimestamp=False)  # reloaded: subsetting a partly instanced font in memory trips over its lazy gvar
    g2c = glyph_chars(font)
    want, found = set(names), set()
    for st in lig_subtables(font):
        kept = {}
        for first, ligs in st.ligatures.items():
            keep = []
            for lg in ligs:
                name = ''.join(g2c.get(g, '\0') for g in [first] + lg.Component).lower()
                if name in want:
                    keep.append(lg); found.add(name)
            if keep:
                kept[first] = keep
        st.ligatures = kept
    missing = want - found
    if missing:
        sys.exit('not in Material Symbols: ' + ', '.join(sorted(missing)))
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.notdef_outline = True
    opts.name_IDs = [0, 1, 2, 3, 4, 5, 6]
    opts.flavor = 'woff2'
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=sorted({ord(c) for c in ''.join(names)} | {0x20}))
    sub.subset(font)
    return font


def page_icons(rel):
    """Icon names written literally in a page (markup and script strings)."""
    s = open(os.path.join(WEB, rel), encoding='utf-8').read()
    return set(re.findall(r'material-symbols-outlined[^>]*>\s*([a-z0-9_]+)\s*<', s))


def current(base):
    hits = [p for p in glob.glob(os.path.join(OUT, base + '.*.woff2')) if re.fullmatch(re.escape(base) + r'\.[0-9a-f]{8}\.woff2', os.path.basename(p))]
    return hits[0] if len(hits) == 1 else None


def check():
    from fontTools.ttLib import TTFont
    bad = 0
    for base, v in ICONS.items():
        path = current(base)
        if not path:
            print('FAIL  %s: no single built file in assets/fonts' % base); bad += 1; continue
        have = set(ligature_names(TTFont(path)))
        for n in sorted(set(v['names']) - have):
            print('FAIL  %s has no glyph for "%s"' % (os.path.basename(path), n)); bad += 1
        for rel in v['pages']:
            for n in sorted(page_icons(rel) - have):
                print('FAIL  %s draws "%s" but %s has no glyph for it (add it to ICONS and rebuild)' % (rel, n, os.path.basename(path))); bad += 1
    for base in list(TEXT) + list(ICONS):
        path = current(base)
        if path:
            name = os.path.basename(path)
            if not any(name in open(f, encoding='utf-8').read() for pat in REF_FILES for f in glob.glob(os.path.join(WEB, pat))):
                print('FAIL  %s is not referenced by any stylesheet or page' % name); bad += 1
    print('icon fonts cover every icon the pages draw' if not bad else '%d problem(s)' % bad)
    return bad


def write_hashed(base, data):
    name = '%s.%s.woff2' % (base, hashlib.sha256(data).hexdigest()[:8])
    for old in glob.glob(os.path.join(OUT, base + '.*.woff2')):
        if re.fullmatch(re.escape(base) + r'\.[0-9a-f]{8}\.woff2', os.path.basename(old)) and os.path.basename(old) != name:
            os.remove(old)
    with open(os.path.join(OUT, name), 'wb') as fh:
        fh.write(data)
    pat = re.compile(r'(?<![\w.-])' + re.escape(base) + r'\.[0-9a-f]{8}\.woff2')
    for g in REF_FILES:
        for f in glob.glob(os.path.join(WEB, g)):
            s = open(f, encoding='utf-8').read()
            n = pat.sub(name, s)
            if n != s:
                open(f, 'w', encoding='utf-8').write(n)
    return name


def main():
    if '--check' in sys.argv:
        sys.exit(1 if check() else 0)
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    nm = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    import io
    for base, rel in TEXT.items():
        print(write_hashed(base, open(os.path.join(nm, rel), 'rb').read()))
    for out, rel in LICENSES.items():
        shutil.copyfile(os.path.join(nm, rel), os.path.join(OUT, out))
    for base, v in ICONS.items():
        buf = io.BytesIO()
        build_icons(os.path.join(nm, ICON_SRC), v['names'], v['axes']).save(buf)
        print(write_hashed(base, buf.getvalue()), len(v['names']), 'icons')
    sys.exit(1 if check() else 0)


if __name__ == '__main__':
    main()
