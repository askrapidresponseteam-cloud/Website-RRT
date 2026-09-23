import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
FAKE='''
window.__plan={steps:[{alts:['show me animal shelters near udapi','show me animal shelters near a teddy'],final:true}]};
class FakeSR{constructor(){this.lang='';}
 start(){window.__lastLang=this.lang;window.__local=this.processLocally;const p=window.__plan||{};setTimeout(()=>{this.onstart&&this.onstart();
   if(p.error){setTimeout(()=>{this.onerror&&this.onerror({error:p.error});this.onend&&this.onend()},200);return}
   let i=0;const steps=p.steps||[];const next=()=>{if(i>=steps.length){setTimeout(()=>this.onend&&this.onend(),100);return}
     const st=steps[i++];const res=st.alts.map(t=>({transcript:t}));res.isFinal=st.final;
     this.onresult&&this.onresult({resultIndex:0,results:[res]});setTimeout(next,150)};setTimeout(next,150)},50)}
 stop(){this.onend&&this.onend()}}
FakeSR.prototype.processLocally=false;
if(window.__LOCAL){FakeSR.available=async()=> 'available';}
window.webkitSpeechRecognition=FakeSR;window.SpeechRecognition=FakeSR;
'''
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for local in (False,True):
      ctx=await b.new_context(viewport={'width':1190,'height':770})
      await ctx.add_init_script(('window.__LOCAL=true;' if local else '')+FAKE)
      pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
      await install(pg);await pg.goto('http://localhost:8080/');await pg.wait_for_timeout(300)
      await pg.click('#mic');await pg.wait_for_timeout(250);print('local' if local else 'cloud','msg while listening:',await pg.inner_text('#vmsg'))
      await pg.wait_for_timeout(700)
      print('  q:',await pg.input_value('#q'),'| pin:',await pg.locator('.fa.pin .fa-q').all_inner_texts(),'| processLocally:',await pg.evaluate('window.__local'))
      print('  msg after:',await pg.inner_text('#vmsg'))
      if local: await pg.screenshot(path='/tmp/vl.png')
      # shop
      await pg.goto('http://localhost:8080/shop');await pg.wait_for_selector('.product')
      await pg.evaluate("window.__plan={steps:[{alts:['show me royal canin puppy food'],final:true}]}")
      print('  shop mic visible:',await pg.is_visible('.find .mic'))
      await pg.click('.find .mic');await pg.wait_for_timeout(1200)
      print('  shop ->',pg.url,'| errors',errs)
      await ctx.close()
    await b.close()
asyncio.run(m())
