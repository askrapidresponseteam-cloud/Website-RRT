import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
FAKE='''
window.__plan=null;
class FakeSR{constructor(){this.lang='';}
 start(){window.__lastLang=this.lang;const p=window.__plan||{};setTimeout(()=>{this.onstart&&this.onstart();
   if(p.error){setTimeout(()=>{this.onerror&&this.onerror({error:p.error});this.onend&&this.onend()},200);return}
   let i=0;const steps=p.steps||[];const next=()=>{if(i>=steps.length){setTimeout(()=>this.onend&&this.onend(),100);return}
     const st=steps[i++];const res=st.alts.map(t=>({transcript:t}));res.isFinal=st.final;
     this.onresult&&this.onresult({resultIndex:0,results:[res]});setTimeout(next,150)};setTimeout(next,150)},50)}
 stop(){this.onend&&this.onend()}}
window.webkitSpeechRecognition=FakeSR;window.SpeechRecognition=FakeSR;
'''
async def run(pg,plan,shot=None):
    await pg.evaluate('p=>window.__plan=p',plan);await pg.click('#mic');await pg.wait_for_timeout(250)
    listening=await pg.evaluate('document.getElementById("mic").classList.contains("on")')
    mid=await pg.input_value('#q')
    await pg.wait_for_timeout(900)
    fa=await pg.locator('.fa .fa-q').all_inner_texts();top=await pg.locator('#results .rr .t').all_inner_texts()
    print(' listening:',listening,'| mid:',repr(mid),'| final:',repr(await pg.input_value('#q')),'| msg:',await pg.inner_text('#vmsg') if await pg.is_visible('#vmsg') else '-','| featured:',fa[:1],'| top:',top[:1],'| lang:',await pg.evaluate('window.__lastLang'))
    if shot: await pg.screenshot(path=shot)
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch();ctx=await b.new_context(viewport={'width':1190,'height':770});await ctx.add_init_script(FAKE)
    pg=await ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    await install(pg);await pg.goto('http://localhost:8080/');await pg.wait_for_timeout(400)
    print('mic visible:',await pg.is_visible('#mic'))
    await run(pg,{'steps':[{'alts':['is my'],'final':False},{'alts':['is my number visible'],'final':True}]},'/tmp/v1.png')
    # alternatives: first guess is a mishearing, second matches the index
    await run(pg,{'steps':[{'alts':['what sap group','whatsapp group',"what's up group"],'final':True}]})
    await run(pg,{'error':'not-allowed'},'/tmp/v2.png')
    await run(pg,{'error':'no-speech'})
    await run(pg,{'steps':[]})
    await pg.click('#langT');await pg.wait_for_timeout(200)
    await run(pg,{'steps':[{'alts':['मेरा नंबर कब दिखता है'],'final':True}]},'/tmp/v3.png')
    print('errors',errs)
    # unsupported browser: no mic
    ctx2=await b.new_context();pg2=await ctx2.new_page();await install(pg2)
    await pg2.add_init_script('delete window.webkitSpeechRecognition;delete window.SpeechRecognition;')
    await pg2.goto('http://localhost:8080/');await pg2.wait_for_timeout(300);print('unsupported mic visible:',await pg2.is_visible('#mic'))
    await b.close()
asyncio.run(m())
