import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
JS='''()=>{
function rgb(s){var m=s.match(/[\\d.]+/g);return m?m.map(Number):[0,0,0,1]}
function lum(c){return (0.2126*c[0]+0.7152*c[1]+0.0722*c[2])/255}
function bg(el){while(el&&el!==document.documentElement){var c=rgb(getComputedStyle(el).backgroundColor);if((c[3]===undefined||c[3]>0.5))return c;el=el.parentElement}return [255,255,255,1]}
var out=[];
document.querySelectorAll('body *').forEach(function(el){
  if(!el.childNodes.length)return;var txt='';el.childNodes.forEach(function(n){if(n.nodeType===3)txt+=n.textContent});txt=txt.trim();if(!txt)return;
  var r=el.getBoundingClientRect();if(r.width<2||r.height<2)return;var cs=getComputedStyle(el);if(cs.visibility==='hidden'||+cs.opacity<0.1)return;
  var c=rgb(cs.color),b=bg(el);var a=c[3]===undefined?1:c[3];
  var eff=[c[0]*a+b[0]*(1-a),c[1]*a+b[1]*(1-a),c[2]*a+b[2]*(1-a)];
  var d=Math.abs(lum(eff)-lum(b));if(d<0.25)out.push((el.className||el.tagName)+' :: '+txt.slice(0,50)+' :: d='+d.toFixed(2));
});return out.slice(0,25)}'''
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch()
    for path in sys.argv[1].split(','):
      pg=await b.new_page(viewport={'width':1440,'height':900});await install(pg)
      await pg.goto('http://localhost:8080'+path);await pg.wait_for_timeout(2500)
      r=await pg.evaluate(JS);print('==',path,len(r));[print('  ',x) for x in r]
      await pg.close()
    await b.close()
asyncio.run(m())
