import asyncio,sys
import os; sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from playwright.async_api import async_playwright
from mock import install
B='http://localhost:8080'
async def main(w,h,tag):
    async with async_playwright() as p:
        b=await p.chromium.launch(); ctx=await b.new_context(viewport={'width':w,'height':h}); pg=await ctx.new_page()
        errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)[:160]))
        await install(pg)
        checkout=[]
        async def vendor(route):
            checkout.append(route.request.url); await route.fulfill(status=200,body='<h1>vendor checkout</h1>',content_type='text/html')
        await pg.route('https://www.pets-lifestyle.com/**',vendor)
        await pg.route('https://08e8df.myshopify.com/cart**',vendor)
        await pg.goto(B+'/shop'); await pg.wait_for_selector('.product')
        n1=await pg.locator('.product').count()
        for _ in range(6):
            await pg.mouse.wheel(0,4000); await pg.wait_for_timeout(500)
        n2=await pg.locator('.product').count()
        print(tag,'infinite scroll tiles',n1,'->',n2, '| count label:', await pg.inner_text('#count'))
        await pg.evaluate('scrollTo(0,0)')
        await pg.locator('.product [data-add]').first.click(); await pg.wait_for_selector('.product .step')
        print(tag,'stepper:', await pg.locator('.product .step span').first.inner_text(),'| bagbar:',await pg.inner_text('.bagbar .bb-t'),'| badge:',await pg.inner_text('#bagCount'))
        await pg.locator('.product .step [data-step="1"]').first.click(); await pg.wait_for_timeout(100)
        print(tag,'after +:', await pg.locator('.product .step span').first.inner_text())
        await pg.screenshot(path=f'/tmp/e2e_shop_{tag}.png')
        # search suggest
        await pg.fill('.hsearch input','royal'); await pg.wait_for_timeout(700)
        print(tag,'suggest items:', await pg.locator('.sugg a').count())
        await pg.press('.hsearch input','Enter'); await pg.wait_for_load_state(); await pg.wait_for_selector('.product')
        print(tag,'search page:', pg.url, await pg.inner_text('#pageTitle'), await pg.locator('.product').count())
        # shelf chip
        await pg.goto(B+'/shop?shelf=pharmacy'); await pg.wait_for_selector('.product'); print(tag,'shelf pharmacy tiles', await pg.locator('.product').count(), 'aisles', await pg.locator('#aisleBar a').count())
        await pg.goto(B+'/shop?b=Pedigree'); await pg.wait_for_timeout(1500); print(tag,'brand page tiles', await pg.locator('.product').count(), await pg.inner_text('#state') if await pg.locator('#state').is_visible() else '')
        # product page with options
        await pg.goto(B+'/shop/p/p-6-zoetis-oatmeal-shampoo'); await pg.wait_for_selector('#title:not(:empty)')
        await pg.screenshot(path=f'/tmp/e2e_pdp_{tag}.png')
        await pg.locator('#options button').nth(1).click(); await pg.click('#add'); await pg.wait_for_timeout(200)
        print(tag,'pdp add ok, badge', await pg.inner_text('#bagCount'))
        await pg.click('#buyNow'); await pg.wait_for_url('**/shop/cart**'); print(tag,'buy now ->', pg.url)
        await pg.wait_for_timeout(600)
        # fill delivery
        f={'firstName':'Asha','lastName':'Rao','email':'asha@example.com','phone':'9876543210','address1':'12 MG Road','city':'Udupi','pin':'576101'}
        for k,v in f.items(): await pg.fill(f'#deliveryForm [name={k}]',v)
        await pg.select_option('#deliveryForm [name=state]','Karnataka')
        await pg.click('#deliverySave'); await pg.wait_for_timeout(1200)
        await pg.screenshot(path=f'/tmp/e2e_cart_{tag}.png',full_page=True)
        print(tag,'checkout btn:', await pg.inner_text('#checkout'),'| lines',await pg.locator('.line').count())
        await pg.click('#checkout'); await pg.wait_for_timeout(1500)
        print(tag,'handoff:', (checkout[0][:160] if checkout else pg.url))
        await pg.goto(B+'/shop/track'); await pg.wait_for_timeout(500)
        await pg.screenshot(path=f'/tmp/e2e_track_{tag}.png',full_page=True)
        print(tag,'errors',errs)
        await b.close()
asyncio.run(main(int(sys.argv[1]),int(sys.argv[2]),sys.argv[3]))
