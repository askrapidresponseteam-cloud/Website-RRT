"""Playwright route mocks for the vendor: GraphQL errors (forces the feed path), Shopify feeds via /pl-api, CDN images."""
import json, re, random
from urllib.parse import urlparse, parse_qs, unquote

random.seed(7)
BRANDS=['Royal Canin','Pedigree','Drools','Himalaya','Whiskas','Farmina','Zoetis','Bravecto','Sheba','Beaphar']
KINDS=[('Adult Dry Dog Food Chicken','dog-food'),('Puppy Starter Veg','dog-food'),('Kitten Gravy Tuna','cat-food'),
 ('Tick & Flea Spot On','pharmacy'),('Liv 52 Pet Liquid','supplements'),('Dental Chew Sticks','treats'),
 ('Oatmeal Shampoo','grooming'),('Rope Tug Toy','gear'),('Multivitamin Tablets','supplements'),('Deworming Tablets','pharmacy')]
PRODUCTS=[]
for i in range(1,131):
    name,col=KINDS[i%len(KINDS)]
    brand=BRANDS[i%len(BRANDS)]
    size=random.choice(['400 g','1.2 kg','3 kg','200 ml','30 tablets','1 pc'])
    price=random.choice([149,249,399,549.19,799,1299,2450,3999])
    cmp=round(price*random.choice([1,1,1.15,1.3]),2)
    avail=i%11!=0
    multi=i%6==0
    variants=[]
    vs=[size] if not multi else ['Small','Medium','Large']
    for k,v in enumerate(vs):
        variants.append({'id':900000+i*10+k,'title':'Default Title' if not multi else v,'option1':'Default Title' if not multi else v,
          'price':f'{price+k*100:.2f}','compare_at_price':(f'{cmp+k*100:.2f}' if cmp>price else None),'available':avail,'featured_image':None})
    PRODUCTS.append({'id':500000+i,'title':f'{brand} {name} {size}','handle':f'p-{i}-'+re.sub('[^a-z0-9]+','-',(brand+' '+name).lower()).strip('-'),
      'body_html':f'<p>{brand} {name}. Made for everyday care.</p><ul><li>Vet recommended</li><li>Pack size {size}</li></ul>',
      'vendor':brand,'product_type':col,'tags':[col],'published_at':f'2026-0{1+i%8}-1{i%9}T10:00:00+05:30',
      'variants':variants,'images':[{'src':f'https://cdn.shopify.com/s/files/mock/{i}.png'}],
      'options':[{'name':'Size' if multi else 'Title','values':vs if multi else ['Default Title']}],'col':col})
BY_HANDLE={p['handle']:p for p in PRODUCTS}
COLORS=['#f4d9c6','#d8e8f0','#e8e2f4','#dcefdc','#f6efcf','#f3dada']

def ajax(p):
    return {'id':p['id'],'title':p['title'],'handle':p['handle'],'description':p['body_html'],'vendor':p['vendor'],'type':p['product_type'],
      'tags':p['tags'],'available':any(v['available'] for v in p['variants']),
      'price':int(round(float(p['variants'][0]['price'])*100)),
      'images':['//cdn.shopify.com/s/files/mock/%d.png'%(p['id']-500000)],'featured_image':'//cdn.shopify.com/s/files/mock/%d.png'%(p['id']-500000),
      'options':[{'name':o['name'],'values':o['values']} for o in p['options']],
      'variants':[{'id':v['id'],'title':v['title'],'price':int(round(float(v['price'])*100)),'compare_at_price':(int(round(float(v['compare_at_price'])*100)) if v['compare_at_price'] else None),
                   'available':v['available'],'option1':v['option1'],'options':[v['option1']],'featured_image':None} for v in p['variants']]}

def svg_png(i):
    c=COLORS[i%len(COLORS)]
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#fff"/><rect x="170" y="110" width="260" height="380" rx="26" fill="{c}"/><text x="300" y="320" font-size="54" text-anchor="middle" font-family="Arial" fill="#333">#{i}</text></svg>'

async def install(page, gql_mode='error'):
    async def gql(route):
        await route.fulfill(status=503, body='busy')
    async def img(route):
        m=re.search(r'/mock/(\d+)\.png',route.request.url)
        await route.fulfill(status=200, content_type='image/svg+xml', body=svg_png(int(m.group(1)) if m else 0))
    async def feed(route):
        u=urlparse(route.request.url); path=unquote(u.path)[len('/pl-api'):]; q=parse_qs(u.query)
        m=re.match(r'^/collections/([^/]+)/products\.json$',path)
        if m:
            h=m.group(1); lim=int(q.get('limit',['30'])[0]); pg=int(q.get('page',['1'])[0])
            items=PRODUCTS if h=='all' else [p for p in PRODUCTS if p['col']==h or (hash(h)%10)==(p['id']%10)]
            sl=items[(pg-1)*lim:pg*lim]
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'products':sl}))
        m=re.match(r'^/products/([^/]+)\.js$',path)
        if m:
            p=BY_HANDLE.get(m.group(1))
            if not p: return await route.fulfill(status=404, body='nf')
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps(ajax(p)))
        if path=='/search/suggest.json':
            t=q.get('q',[''])[0].lower()
            hits=[p for p in PRODUCTS if all(w in p['title'].lower() for w in t.split())][:10]
            res={'resources':{'results':{'products':[{'id':p['id'],'title':p['title'],'handle':p['handle'],'price':p['variants'][0]['price'],'price_min':p['variants'][0]['price'],'price_max':p['variants'][-1]['price'],
                'available':True,'vendor':p['vendor'],'image':'https://cdn.shopify.com/s/files/mock/%d.png'%(p['id']-500000),'url':'/products/'+p['handle']} for p in hits],
                'collections':[]}}}
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps(res))
        if path=='/recommendations/products.json':
            return await route.fulfill(status=200, content_type='application/json', body=json.dumps({'products':[ajax(p) for p in PRODUCTS[:8]]}))
        await route.fulfill(status=404, body='nf')
    async def cdn(route):
        u=route.request.url
        if 'jspdf' in u:
            return await route.fulfill(status=200, content_type='text/javascript', body=open('/tmp/jsp/package/dist/jspdf.umd.min.js').read())
        await route.fulfill(status=404, body='')
    await page.route('**/cdnjs.cloudflare.com/**', cdn)
    await page.route('**/graphql.json', gql)
    await page.route('**/cdn.shopify.com/**', img)
    await page.route('**/pl-api/**', feed)
    # third-party CDNs are offline in the sandbox; answer fast instead of hanging
    FAKE=open(__file__.replace('mock.py','fakefb.js')).read()
    async def gst(route):
        u=route.request.url
        if 'firebase-app-compat' in u: return await route.fulfill(status=200, content_type='text/javascript', body=FAKE)
        await route.fulfill(status=200, content_type='text/javascript' if u.endswith('.js') else 'text/css', body='')
    await page.route(re.compile(r'https://(www\.gstatic\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/.*'), gst)
