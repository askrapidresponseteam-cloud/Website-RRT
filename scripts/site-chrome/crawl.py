import asyncio,sys,urllib.request
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
B='http://localhost:8080'
PAGES=['/','/faq','/know-the-laws','/legal-desk','/vet','/report','/report/manage','/manage','/app-guide','/shop','/shop/cart','/shop/saved','/shop/track','/shop/p/p-1-pedigree-puppy-starter-veg','/shop?shelf=pharmacy','/shop?q=royal']
def status(u):
    try:
        r=urllib.request.urlopen(urllib.request.Request(u,method='GET'),timeout=10);return r.status
    except urllib.error.HTTPError as e: return e.code
    except Exception as e: return str(e)[:40]
async def main():
    internal={};external=set();errs={}
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for path in PAGES:
            ctx=await b.new_context(viewport={'width':1440,'height':900});pg=await ctx.new_page()
            e=[];pg.on('pageerror',lambda x,e=e:e.append(str(x)[:100]))
            await install(pg);await pg.goto(B+path);await pg.wait_for_timeout(1500)
            hrefs=await pg.evaluate('[...document.querySelectorAll("a[href]")].map(a=>a.getAttribute("href"))')
            for h in hrefs:
                if not h or h.startswith('#') or h.startswith('javascript'): continue
                if h.startswith('mailto:') or h.startswith('http'):
                    if 'localhost' not in h: external.add(h.split('?')[0][:90]); continue
                internal.setdefault(h,set()).add(path)
            real=[x for x in e if 'firebase' not in x]
            if real: errs[path]=real
            await ctx.close()
        await b.close()
    bad=0
    for h,src in sorted(internal.items()):
        u=B+h if h.startswith('/') else B+'/'+h
        st=status(u.split('#')[0])
        if st not in (200,308,307):
            bad+=1;print('BROKEN',st,h,'from',sorted(src)[:3])
    print('internal links checked:',len(internal),'broken:',bad)
    print('external:',sorted(external))
    print('page errors (non-firebase):',errs)
asyncio.run(main())
