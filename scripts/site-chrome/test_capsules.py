"""Every Related capsule in every homepage panel must scroll to, highlight and focus its own answer (EN + HI, desktop + phone)."""
import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for w,h,tag,touch in [(1440,900,'desktop',False),(390,844,'mobile',True)]:
      ctx=await b.new_context(viewport={'width':w,'height':h},has_touch=touch,is_mobile=touch);pg=await ctx.new_page()
      errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));await install(pg)
      await pg.goto('http://localhost:8080/');await pg.wait_for_timeout(500)
      ids=['sos', 'ask', 'gap', 'network', 'roles', 'parents', 'feeders', 'rescuers', 'vets', 'promises', 'shop', 'report', 'laws', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12']
      total=bad=0
      for lang in ['en','hi']:
        await pg.evaluate(f'setLang("{lang}")')
        for sid in ids:
          await pg.evaluate(f'location.hash="#s-{sid}"');await pg.wait_for_timeout(320)
          chips=await pg.evaluate('[...document.querySelectorAll("#shB [data-jump]")].map(c=>[c.getAttribute("data-jump"),c.innerText.trim()])')
          for rid,label in chips:
            total+=1
            loc=pg.locator(f'#shB [data-jump="{rid}"]')
            await pg.evaluate(f'(()=>{{var c=document.querySelector("#shB [data-jump={rid}]");var b=document.getElementById("shB");var r=c.getBoundingClientRect(),q=b.getBoundingClientRect();if(r.top<q.top||r.bottom>q.bottom)b.scrollTop+=r.top-q.top-60}})()');await pg.wait_for_timeout(80)
            if touch: await loc.tap()
            else:
              try: await loc.click(timeout=3000)
              except Exception:
                print('CLICK FAIL',tag,lang,sid,rid, await pg.evaluate(f'(()=>{{var c=document.querySelector("#shB [data-jump={rid}]").getBoundingClientRect();var s=document.getElementById("sheet");return [c.top,c.left,c.width,s.className,getComputedStyle(s).transform,innerWidth]}})()'));raise
            await pg.evaluate('new Promise(r=>{var b=document.getElementById("shB"),last=-1,same=0,n=0;var i=setInterval(()=>{n++;if(b.scrollTop===last){same++}else{same=0;last=b.scrollTop}if(same>=4||n>60){clearInterval(i);r()}},40)})')
            r=await pg.evaluate(f'''(()=>{{var b=document.getElementById("shB"),s=document.getElementById("shq-{rid}");if(!s)return null;
              var off=s.getBoundingClientRect().top-b.getBoundingClientRect().top;var a=document.activeElement;
              return {{off:Math.round(off),hl:s.classList.contains("hl"),focus:a&&a.id,ftext:a?a.innerText.trim():"",maxScroll:b.scrollHeight-b.clientHeight,scroll:Math.round(b.scrollTop)}}}})()''')
            ok= r and r['hl'] and r['focus']==f'shqh-{rid}' and r['ftext']==label and abs(r['off']-8)<=2
            if not ok: bad+=1; print(tag,lang,sid,'->',rid,label,r)
          # back to top
          if chips:
            await pg.evaluate(f'document.querySelector("#shq-{chips[-1][0]} [data-jump-top]").scrollIntoView({{block:"center"}})');await pg.locator(f'#shq-{chips[-1][0]} [data-jump-top]').click();await pg.wait_for_timeout(700)
            st=await pg.evaluate('document.getElementById("shB").scrollTop')
            if st>4: bad+=1; print(tag,'back-to-top failed',sid,st)
          await pg.evaluate('document.getElementById("shX").click()');await pg.wait_for_timeout(300)
      # screenshot one case
      await pg.evaluate('setLang("en")');await pg.evaluate('location.hash="#s-f1"');await pg.wait_for_timeout(350)
      await pg.locator('#shB [data-jump="f3"]').click() if not touch else await pg.locator('#shB [data-jump="f3"]').tap()
      await pg.wait_for_timeout(1000);await pg.screenshot(path=f'/tmp/jump_{tag}.png')
      print(tag,'capsules tested',total,'failures',bad,'errors',errs)
      await ctx.close()
    await b.close()
asyncio.run(m())
