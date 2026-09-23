"""Logo must sit in the same place, at the same size, on every page."""
import asyncio,sys,os
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
PAGES=['/','/faq','/know-the-laws','/legal-desk','/vet','/report','/report/manage','/manage','/app-guide','/preview','/shop','/shop/p/p-1-pedigree-puppy-starter-veg','/shop/cart','/shop/saved','/shop/track']
JS='''(()=>{var m=document.querySelector('.rr-mark,.brand .mark');var t=document.querySelector('.rr-brand>span,.brand>span');var h=document.querySelector('.rr-hdr,body>header');
 function r(e){if(!e)return null;var b=e.getBoundingClientRect();return [b.left,b.top+scrollY,b.width,b.height].map(function(v){return Math.round(v*100)/100})}
 var cs=t?getComputedStyle(t):null;return {mark:r(m),text:r(t),hdr:r(h),font:cs?[cs.fontFamily.split(',')[0],cs.fontSize,cs.letterSpacing]:null}})()'''
async def main():
  widths=[(1440,900),(1190,770),(820,1180),(390,844),(360,640)]
  bad=0
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w,h in widths:
      ctx=await b.new_context(viewport={'width':w,'height':h});pg=await ctx.new_page();await install(pg)
      ref=None
      for path in PAGES:
        await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(700)
        r=await pg.evaluate(JS)
        key=(r['mark'],r['text'][:2] if r['text'] else None,r['hdr'][3] if r['hdr'] else None,tuple(r['font'] or []))
        if ref is None: ref=(path,key)
        ok=key==ref[1]
        if not ok: bad+=1
        if not ok or '-v' in sys.argv: print(f'{w:5} {"ok " if ok else "OFF"} {path:40} mark={r["mark"]} text={r["text"]} hdrH={r["hdr"][3] if r["hdr"] else None} font={r["font"]}')
      print(w,'reference',ref[0],ref[1][0],'hdrH',ref[1][2])
      await ctx.close()
    await b.close()
  print('pages off:',bad);sys.exit(1 if bad else 0)
asyncio.run(main())
