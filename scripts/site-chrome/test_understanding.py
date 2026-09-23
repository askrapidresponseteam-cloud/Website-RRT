import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
QS=["show me animal shelters near udapi","find rescuers","animal rescuers in mangalore","vets near me","show vets","find a vet in bangalore","open rescue cases","cases in udipi","udupi cases","sos cases","raise an sos","my dog was hit by a car","ask the district","buy dog food","order tick medicine","is my numbr visibel","whatsap group","traking location","please tell me what is rrt","how do i report cruelty","feeding rights rwa","can people see my phone number","join as a vet"]
async def m():
  async with async_playwright() as p:
    b=await p.chromium.launch();pg=await b.new_page(viewport={'width':1190,'height':770})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    await install(pg);await pg.goto('http://localhost:8080/');await pg.wait_for_timeout(400)
    for qq in QS:
      await pg.fill('#q',qq);await pg.wait_for_timeout(50)
      pin=await pg.locator('.fa.pin .fa-q').all_inner_texts();fa=await pg.locator('.fa:not(.pin) .fa-q').all_inner_texts()
      top=await pg.locator('#results .rr .t').all_inner_texts()
      print(f'{qq!r:40} PIN={pin[0] if pin else "-":45} FEAT={fa[0][:40] if fa else "-":42} TOP={top[0][:40] if top else "-"}')
    await pg.fill('#q','show me animal shelters near udapi');await pg.wait_for_timeout(80);await pg.screenshot(path='/tmp/u1.png')
    await pg.fill('#q','cases in udipi');await pg.keyboard.press('Enter');await pg.wait_for_timeout(1500);print('enter ->',pg.url, await pg.input_value('#searchIn'))
    print('errors',errs);await b.close()
asyncio.run(m())
