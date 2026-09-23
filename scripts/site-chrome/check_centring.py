"""Measure whether text/icons are optically centred inside every capsule/button on a page.
Reports dx, dy in CSS px between the ink box centre and the element centre."""
import asyncio,sys,io
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
from PIL import Image
SEL='button, a.btn, .btn, .rr-btn, .chip, .category-bar a, .add, .step button, .bagbar a, .btn-solid, .btn-line, .go, .mic, .lb, .cta-pri, .btn-primary, .btn-ghost, .qrow > *, .opt-vals button, .opt-vals a, .flag, .in-bag, .shopbar-links a'
JS='''(sel)=>{var out=[];document.querySelectorAll(sel).forEach(function(el,i){
 var r=el.getBoundingClientRect();if(r.width<16||r.height<16||r.width>520||r.height>90)return;
 var cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none'||+cs.opacity<.5)return;
 var bg=cs.backgroundColor,bw=parseFloat(cs.borderTopWidth)||0;
 var hasBox=(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')||bw>0;if(!hasBox)return;
 if(!(el.innerText||'').trim()&&!el.querySelector('svg'))return;
 if(r.top<0||r.bottom>innerHeight)return;
 el.setAttribute('data-ck',i);
 out.push({i:i,x:r.left,y:r.top,w:r.width,h:r.height,bw:bw,rad:Math.min(r.height/2,(cs.borderTopLeftRadius.indexOf('%')>0?r.height/2:parseFloat(cs.borderTopLeftRadius)||0)),geo:(function(){var s=el.querySelector('.rr-oc');if(!s||!s.classList.contains('rr-oc-b'))return null;var q=s.getBoundingClientRect();var bl=parseFloat(cs.borderLeftWidth)+parseFloat(cs.paddingLeft),br=parseFloat(cs.borderRightWidth)+parseFloat(cs.paddingRight),bt=parseFloat(cs.borderTopWidth)+parseFloat(cs.paddingTop),bb=parseFloat(cs.borderBottomWidth)+parseFloat(cs.paddingBottom);var cx=(r.left+bl+r.right-br)/2,cy=(r.top+bt+r.bottom-bb)/2;var ls=parseFloat(cs.letterSpacing)||0;return [(q.left+q.right-ls)/2-cx,(q.top+q.bottom)/2-cy]})(),color:cs.color,bg:bg,txt:(el.innerText||'svg').trim().slice(0,24),icon:!(el.innerText||'').trim()||/^[\u2190-\u21ff\u2661\u00d7+\u2212]$/.test((el.innerText||'').trim()),cls:(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className)||el.tagName})});return out}'''
def rgb(s):
    import re;v=[float(x) for x in re.findall(r'[\d.]+',s)];return v[:3]
def measure(img,e,S):
    W,H=img.size;px=img.load();bw=e['bw']*S+2*S;rad=max(0,e['rad']*S-bw)
    tc=rgb(e['color']);bg=px[W//2,int(bw)+1]
    full=sum(abs(tc[k]-bg[k]) for k in range(3))
    thr=max(60,full*0.45) if full>80 else 60
    xs=[];ys=[]
    for y in range(int(bw),int(H-bw)):
        for x in range(int(bw),int(W-bw)):
            cx=min(max(x,bw+rad),W-bw-rad);cy=min(max(y,bw+rad),H-bw-rad)
            if (x-cx)**2+(y-cy)**2>rad*rad:continue
            p=px[x,y]
            if abs(p[0]-bg[0])+abs(p[1]-bg[1])+abs(p[2]-bg[2])>thr: xs.append(x);ys.append(y)
    if not xs:return None
    import collections
    colb={}
    for x,y in zip(xs,ys): colb[x]=max(colb.get(x,0),y)
    if e.get('icon'): top,bot=min(ys),max(ys)
    else: top=min(ys);bot=collections.Counter(colb.values()).most_common(1)[0][0]
    return ((min(xs)+max(xs)+1)/2-W/2)/S,((top+bot+1)/2-H/2)/S
async def main():
    paths=sys.argv[1].split(',');w=int(sys.argv[2]);h=int(sys.argv[3]);S=2
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for path in paths:
            ctx=await b.new_context(viewport={'width':w,'height':h},device_scale_factor=S);pg=await ctx.new_page()
            await install(pg);await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(1500)
            if 'cart' in path: pass
            els=await pg.evaluate(JS,SEL)
            shot=Image.open(io.BytesIO(await pg.screenshot())).convert('RGB')
            bad=0
            for e in els:
                box=(int(e['x']*S),int(e['y']*S),int((e['x']+e['w'])*S),int((e['y']+e['h'])*S))
                m=measure(shot.crop(box),e,S)
                if not m:continue
                dx,dy=m
                g=e.get('geo')
                if g: dx,dy=g[0],g[1]; flag=abs(dx)>0.3 or abs(dy)>0.3
                else: flag=abs(dx)>0.6 or abs(dy)>0.6
                if flag:bad+=1
                if flag or '-v' in sys.argv:print(f'  {"OFF" if flag else "ok "} {"geo" if e.get("geo") else "ink"} dx={dx:+.2f} dy={dy:+.2f}  {e["txt"]!r:26} {str(e["cls"])[:40]}')
            print(path,'checked',len(els),'off',bad)
            await ctx.close()
        await b.close()
if __name__=="__main__": asyncio.run(main())
