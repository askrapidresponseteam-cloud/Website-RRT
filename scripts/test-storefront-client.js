#!/usr/bin/env node
/**
 * Tests for web/assets/rrt-shop.js - the web twin of the app's store layer.
 *
 * These mirror the app's client/test/store_models_test.dart: money, parsing,
 * the whole-word label rules, the checkout link, references, the cart and
 * the pre-checkout revalidation. Where a case exists in the Dart tests, the
 * expected value here is the same value, so the two clients cannot drift
 * apart silently.
 *
 * Run: node scripts/test-storefront-client.js
 */
'use strict';

require(require('path').join(__dirname, '..', 'assets', 'rrt-shop.js'));
const S = globalThis.RRTShop;

let passed = 0;
let failed = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) { passed++; return; }
  failed++;
  console.log(`  FAIL  ${name}\n        expected ${b}\n        got      ${a}`);
}
function ok(cond, name) { eq(!!cond, true, name); }

/* ------------------------------------------------------------------ money */

eq(S.money(123400), '₹1,234', 'formatPaise groups rupees');
eq(S.money(11719), '₹117.19', 'formatPaise keeps paisa pricing');
eq(S.money(100000000), '₹10,00,000', 'formatPaise Indian grouping (lakh)');
eq(S.money(123456789), '₹12,34,567.89', 'formatPaise crore grouping with paise');
eq(S.money(0), '₹0', 'formatPaise zero');
eq(S.money(-50), '-₹0.50', 'formatPaise negative paise');

eq(S.paiseFromDecimal('245.00'), 24500, 'decimal string to paise');
eq(S.paiseFromDecimal('245'), 24500, 'integer string to paise');
eq(S.paiseFromDecimal('0.29'), 29, 'text parse never 28.999…');
eq(S.paiseFromDecimal(245.5), 24550, 'double to paise');
eq(S.paiseFromDecimal('1,245.00'), 124500, 'comma-grouped input');
eq(S.paiseFromDecimal('245.0'), 24500, 'Storefront API one-decimal amounts');
eq(S.paiseFromDecimal('abc'), null, 'junk is null, not zero');
eq(S.paiseFromDecimal(null), null, 'null stays null');

eq(S.paiseFromSubunits(24500), 24500, 'subunits pass through');
eq(S.paiseFromSubunits('24500'), 24500, 'numeric-string subunits');
eq(S.paiseFromSubunits('x'), null, 'junk subunits are null');

/* ----------------------------------------------------------------- images */

eq(S.imageUrl('//cdn.shopify.com/a.png'), 'https://cdn.shopify.com/a.png', 'protocol-relative image');
eq(S.imageUrl('/cdn/shop/a.png'), 'https://www.pets-lifestyle.com/cdn/shop/a.png', 'site-relative image');
eq(S.imageUrl('http://cdn.shopify.com/a.png'), 'https://cdn.shopify.com/a.png', 'http upgraded');
eq(S.sizedImage('https://cdn.shopify.com/a.png?v=1', 480), 'https://cdn.shopify.com/a.png?v=1&width=480', 'sized image keeps query');
eq(S.sizedImage('https://cdn.shopify.com/a.png?width=900', 480), 'https://cdn.shopify.com/a.png?width=480', 'sized image replaces width');
eq(S.sizedImage('https://elsewhere.example/a.png', 480), 'https://elsewhere.example/a.png', 'non-Shopify image untouched');

/* -------------------------------------------------- whole-word label rules */

function fakeProduct(title, extra) {
  return Object.assign({
    title, tags: [], productType: '', descriptionHtml: ''
  }, extra || {});
}
ok(!S.rules.isVeg(fakeProduct('Herbal Shampoo')), '"shampoo" is not ham');
ok(!S.rules.hideWhenVegOnly(fakeProduct('Same-day delivery biscuits')), '"delivery" is not liver');
ok(S.rules.isVeg(fakeProduct('Vegetarian Dog Biscuits')), 'vegetarian in title marks veg');
ok(!S.rules.isVeg(fakeProduct('Veggie & Chicken Treats')), 'chicken in title blocks veg');
ok(!S.rules.hideWhenVegOnly(fakeProduct('Plush Duck Dog Toy')), 'a plush duck is not a duck');
ok(S.rules.hideWhenVegOnly(fakeProduct('Chicken Flavoured Dental Chew Toy')), 'flavoured gear is edible after all');
ok(!S.rules.hideWhenVegOnly(fakeProduct('Vegetarian Training Treats')), 'veg-marked food stays under veg-only');
ok(S.rules.hideWhenVegOnly(fakeProduct('Puppy Starter', { descriptionHtml: '<p>Made with real chicken.</p>' })),
  'animal ingredient in opening description hides under veg-only');
ok(S.rules.isRx(fakeProduct('Amoxicillin 250', { tags: ['Schedule H'] })), 'Schedule H tag marks Rx');
ok(!S.rules.isRx(fakeProduct('Multivitamin syrup')), 'plain product is not Rx');

/* ------------------------------------------------------------ description */

const blocks = S.descriptionBlocks(
  '<p><strong>Composition</strong></p><ul><li>Item &amp; one</li><li>Item two</li></ul>' +
  '<h3>Dosage</h3><p>Twice a day.</p><table><tr><td>A</td><td>B</td></tr></table>'
);
eq(blocks[0], { kind: 'heading', text: 'Composition' }, 'bold-only paragraph becomes heading');
eq(blocks[1], { kind: 'bullet', text: 'Item & one' }, 'list item becomes bullet, entities decoded');
eq(blocks[3], { kind: 'heading', text: 'Dosage' }, 'h3 becomes heading');
eq(blocks[4], { kind: 'paragraph', text: 'Twice a day.' }, 'paragraph kept');
ok(blocks.every((b) => !/[<>]/.test(b.text)), 'no markup survives into blocks');
eq(S.decodeEntities('R&amp;D &#8377; &frac12;'), 'R&D ₹ ½', 'entity decoding, named and numeric');

/* -------------------------------------------------------- GraphQL parsing */

const tileNode = {
  id: 'gid://shopify/Product/101',
  handle: 'puppy-food-1kg',
  title: ' Puppy Food ',
  vendor: 'Acme',
  productType: 'Food',
  availableForSale: true,
  publishedAt: '2026-01-05T00:00:00Z',
  featuredImage: { url: '//cdn.shopify.com/p.png' },
  priceRange: { minVariantPrice: { amount: '245.0' }, maxVariantPrice: { amount: '540.0' } },
  compareAtPriceRange: { maxVariantPrice: { amount: '600.0' } }
};
const tile = S.__internal.productFromGraphTile(tileNode);
eq(tile.id, 101, 'tile: numeric id from gid');
eq(tile.title, 'Puppy Food', 'tile: title trimmed');
eq(tile.cheapestVariant.pricePaise, 24500, 'tile: from-price is the range minimum');
eq(tile.priceVaries, true, 'tile: price range means price varies');
eq(tile.cheapestVariant.compareAtPaise, null, 'tile: no strikethrough against a price range');
ok(tile.partial, 'tile products are partial');

const singleTile = S.__internal.productFromGraphTile(Object.assign({}, tileNode, {
  priceRange: { minVariantPrice: { amount: '245.0' }, maxVariantPrice: { amount: '245.0' } }
}));
eq(singleTile.cheapestVariant.compareAtPaise, 60000, 'tile: single price shows honest strikethrough');

const fullNode = {
  id: 'gid://shopify/Product/7',
  handle: 'wormer',
  title: 'Wormer',
  vendor: 'Acme',
  productType: 'Pharmacy',
  tags: ['dogs'],
  descriptionHtml: '<p>Broad spectrum.</p>',
  publishedAt: '2026-02-01T00:00:00Z',
  featuredImage: { url: '//cdn.shopify.com/f.png' },
  images: { nodes: [{ url: '//cdn.shopify.com/1.png' }, { url: '//cdn.shopify.com/2.png' }] },
  options: [{ name: 'Size' }],
  variants: { nodes: [
    { id: 'gid://shopify/ProductVariant/71', title: '1 kg', availableForSale: true,
      price: { amount: '117.19' }, compareAtPrice: { amount: '117.19' },
      image: { url: '//cdn.shopify.com/v1.png' }, selectedOptions: [{ name: 'Size', value: '1 kg' }] },
    { id: 'gid://shopify/ProductVariant/72', title: '3 kg', availableForSale: false,
      price: { amount: '300.00' }, compareAtPrice: { amount: '350.00' },
      image: null, selectedOptions: [{ name: 'Size', value: '3 kg' }],
      quantityRule: { maximum: 2, minimum: 1, increment: 1 } }
  ] }
};
const full = S.__internal.productFromGraphFull(fullNode);
eq(full.variants[0].pricePaise, 11719, 'full: paisa-priced variant exact');
eq(full.variants[0].compareAtPaise, null, 'full: compare-at at price is noise, not a sale');
eq(full.variants[1].compareAtPaise, 35000, 'full: real compare-at kept');
eq(full.variants[1].maxQty, 2, 'full: vendor quantity rule respected');
eq(full.optionCount, 1, 'full: one option picker');
eq(full.valuesForOption(0), ['1 kg', '3 kg'], 'full: option values in vendor order');
eq(full.variantMatching(['3 kg']).id, 72, 'full: variant matched by option values');
ok(full.isValueAvailable(0, '1 kg', ['1 kg']), 'full: sellable value not struck');
ok(!full.isValueAvailable(0, '3 kg', ['3 kg']), 'full: sold-out value struck');
eq(full.defaultVariant.id, 71, 'full: default variant is first available');
eq(full.cheapestVariant.id, 71, 'full: cheapest counts only in-stock variants');

/* --------------------------------------- vendor feed parsers (app parity) */

// /collections/{handle}/products.json - decimal-string prices, body_html.
const feedProd = S.__internal.productFromFeed({
  id: 7, handle: 'wormer', title: ' Wormer ', vendor: 'Acme',
  product_type: 'Pharmacy', tags: 'dogs, Prescription only',
  body_html: '<p>Broad spectrum.</p>',
  published_at: '2026-02-01T00:00:00Z',
  images: [{ src: '//cdn.shopify.com/1.png' }, { src: '/cdn/shop/2.png' }],
  options: [{ name: 'Size', values: ['1 kg', '3 kg'] }],
  variants: [
    { id: 71, title: '1 kg', option1: '1 kg', price: '117.19', compare_at_price: '117.19', available: true,
      featured_image: { src: '//cdn.shopify.com/v1.png' } },
    { id: 72, title: '3 kg', option1: '3 kg', price: '300.00', compare_at_price: '350.00', available: false }
  ]
});
eq(feedProd.title, 'Wormer', 'feed: title trimmed');
eq(feedProd.variants[0].pricePaise, 11719, 'feed: decimal string parsed to exact paise');
eq(feedProd.variants[0].compareAtPaise, null, 'feed: compare-at at price is noise');
eq(feedProd.variants[1].compareAtPaise, 35000, 'feed: real compare-at kept');
eq(feedProd.tags, ['dogs', 'Prescription only'], 'feed: CSV tags split');
ok(feedProd.isRx, 'feed: rx read from the vendor tags');
eq(feedProd.images[1], 'https://www.pets-lifestyle.com/cdn/shop/2.png', 'feed: site-relative image absolutised');
ok(feedProd.createdAtMs > 0, 'feed: published_at kept for newest sort');
ok(!feedProd.partial, 'feed products are complete');
eq(S.__internal.productFromFeed({ id: 9, handle: 'x', variants: [] }), null,
  'feed: a product with no priced variant cannot be sold');

// /products/{handle}.js - integer paise, quantity rules, string images.
const ajaxProd = S.__internal.productFromAjax({
  id: 7, handle: 'wormer', title: 'Wormer', vendor: 'Acme', type: 'Pharmacy',
  tags: ['dogs'], description: '<p>Broad spectrum.</p>',
  images: ['//cdn.shopify.com/1.png'],
  options: ['Size'],
  variants: [
    { id: 71, title: '1 kg', option1: '1 kg', price: 11719, compare_at_price: 11719, available: true },
    { id: 72, title: '3 kg', option1: '3 kg', price: 30000, compare_at_price: 35000, available: false,
      quantity_rule: { max: 2, min: 1, increment: 1 } }
  ]
});
eq(ajaxProd.variants[0].pricePaise, 11719, 'ajax: integer paise kept as-is');
eq(ajaxProd.variants[1].maxQty, 2, 'ajax: vendor quantity rule respected');
eq(ajaxProd.productType, 'Pharmacy', 'ajax: `type` field read');
eq(ajaxProd.valuesForOption(0), ['1 kg', '3 kg'], 'ajax: values read off variants for bare option names');
eq(ajaxProd.descriptionHtml, '<p>Broad spectrum.</p>', 'ajax: description field read');

// /search/suggest.json - partial tiles with a price range.
const sugProd = S.__internal.productFromSuggest({
  id: 5, handle: 'gravy', title: 'Gravy &amp; Chunks', vendor: 'JerHigh',
  price_min: '70.00', price_max: '3072.00', compare_at_price_max: '90.00',
  available: true, featured_image: { url: '//cdn.shopify.com/s.png' }
});
eq(sugProd.title, 'Gravy & Chunks', 'suggest: entities decoded');
eq(sugProd.cheapestVariant.pricePaise, 7000, 'suggest: from-price is price_min');
eq(sugProd.priceVaries, true, 'suggest: range means price varies');
eq(sugProd.cheapestVariant.compareAtPaise, null, 'suggest: no strikethrough against a range');
ok(sugProd.partial, 'suggest products are partial');

/* ----------------------------------------------------------- browse rules */

function tileWith(price, opts) {
  opts = opts || {};
  return S.__internal.wrapProduct({
    id: opts.id || price, handle: 'h' + price, title: opts.title || 'P' + price,
    brand: '', productType: '', tags: [], descriptionHtml: '',
    images: [], options: [],
    variants: [{ id: 0, title: 'Default Title', optionValues: [], pricePaise: price, available: opts.available !== false }],
    partial: true, createdAtMs: opts.createdAtMs || null
  });
}
const listing = [tileWith(300), tileWith(100), tileWith(200, { available: false }), tileWith(50, { createdAtMs: 5 })];
eq(S.visibleProducts(listing, { sort: 'priceLow' }).map((p) => p.cheapestVariant.pricePaise),
  [50, 100, 200, 300], 'sort price low');
eq(S.visibleProducts(listing, { sort: 'priceHigh' })[0].cheapestVariant.pricePaise, 300, 'sort price high');
eq(S.visibleProducts(listing, { inStockOnly: true, sort: 'featured' }).length, 3, 'in-stock filter');
eq(S.visibleProducts(listing, { sort: 'newest' })[0].createdAtMs, 5, 'newest first; undated keep order after');

/* ---------------------------------------------------------------- shelves */

eq(S.shelves.length, 10, 'ten shelves, as in the app');
eq(S.shelves.reduce((a, s) => a + s.aisles.length, 0), 71, '71 aisle handles, as in the app');
eq(S.shelfByKey('pharmacy').aisles[0].handle, 'dog-fleas-ticks', 'shelf lookup by key');
eq(S.shelfForAisle('clearance-sale').key, 'sale', 'shelf lookup by aisle handle');
eq(S.shelfByKey('pharmacy').preview, 'Flea & Tick · Deworming · Antibiotics +13', 'hub preview line matches the app');

/* ------------------------------------------------------ checkout permalink */

const lines = [
  { variantId: 111, qty: 2, available: true, handle: 'a', title: 'A', variantTitle: '', pricePaise: 100, productId: 1, imageUrl: null },
  { variantId: 222, qty: 1, available: true, handle: 'b', title: 'B', variantTitle: '', pricePaise: 200, productId: 2, imageUrl: null },
  { variantId: 333, qty: 0, available: true, handle: 'c', title: 'C', variantTitle: '', pricePaise: 300, productId: 3, imageUrl: null },
  { variantId: 444, qty: 1, available: false, handle: 'd', title: 'D', variantTitle: '', pricePaise: 400, productId: 4, imageUrl: null }
];
const url = S.checkoutUrl(lines, { rrtRef: 'RRT-TEST123456', buyerName: 'Asha Rao', buyerPhone: '+91 98765-43210' });
ok(url.indexOf('https://www.pets-lifestyle.com/cart/111:2,222:1?') === 0,
  'permalink lists only sellable lines, in order');
ok(url.indexOf(encodeURIComponent('attributes[source]') + '=' + encodeURIComponent('RRT website')) !== -1,
  'source attribute says RRT website');
ok(url.indexOf('ref=rrt-web') !== -1, 'ref says rrt-web');
ok(url.indexOf(encodeURIComponent('attributes[rrt_ref]') + '=RRT-TEST123456') !== -1,
  'rrt_ref rides as a cart attribute');
ok(url.indexOf(encodeURIComponent('checkout[shipping_address][first_name]') + '=Asha') !== -1,
  'first name prefilled');
ok(url.indexOf(encodeURIComponent('checkout[shipping_address][phone]') + '=' + encodeURIComponent('+919876543210')) !== -1,
  'phone prefilled digits-only');
const cartUrl = S.checkoutUrl(lines, { toVendorCart: true });
ok(cartUrl.indexOf('storefront=true') !== -1, 'vendor-cart fallback flagged');
ok(cartUrl.indexOf('first_name') === -1, 'no prefill on the vendor-cart fallback');

for (let i = 0; i < 200; i++) {
  const ref = S.newRrtRef();
  if (!/^RRT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(ref)) {
    failed++; console.log('  FAIL  rrt_ref alphabet/format: ' + ref); break;
  }
}
passed++;

/* ------------------------------------------------------------------- cart */

S.clearCart();
S.add(full, full.variants[0], 1);
S.add(full, full.variants[0], 1);
eq(S.cart().lines[0].qty, 2, 'adding same variant merges quantity');
eq(S.cart().subtotalPaise, 23438, 'subtotal in paise, to the paisa');
S.add(full, full.variants[1], 5);
eq(S.cart().lines[1].qty, 2, 'vendor max quantity caps the add');
S.setQuantity(71, 99 + 5);
eq(S.cart().lines[0].qty, 99, 'stepper hard cap at 99 without a vendor rule');
S.setQuantity(71, 0);
eq(S.cart().lines.length, 1, 'zero quantity removes the line');
S.clearCart();
eq(S.cart().count, 0, 'clear empties the cart');

/* --------------------------------------------------------- brand page */
function brandPageTests() {
  var calls = [];
  S.__internal.setFetch(function (url, init) {
    var body = init && init.body ? String(init.body) : '';
    calls.push(body);
    if (body.indexOf('RrtBrand') !== -1) {
      var vars = JSON.parse(body).variables;
      if (vars.q !== "vendor:'Zoetis'") throw new Error('wrong vendor query: ' + vars.q);
      return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ data: { products: {
        pageInfo: { hasNextPage: true, endCursor: 'c2' },
        nodes: [{ id: 'gid://shopify/Product/9', handle: 'apoquel-16', title: 'Zoetis Apoquel 16mg',
          vendor: 'Zoetis', productType: 'Pharmacy', tags: [],
          featuredImage: null,
          priceRange: { minVariantPrice: { amount: '2490.0' }, maxVariantPrice: { amount: '2490.0' } },
          compareAtPriceRange: { minVariantPrice: { amount: '3216.0' } },
          availableForSale: true, totalInventory: 5 }]
      } } }); } });
    }
    throw new Error('unexpected fetch: ' + body.slice(0, 60));
  });
  return S.brandPage('Zoetis', {}).then(function (page) {
    eq(page.products.length, 1, 'brand page parses tiles');
    eq(page.products[0].brand, 'Zoetis', 'and they are the brand');
    eq(page.hasMore, true, 'brand pages paginate');
    eq(page.endCursor, 'c2', 'with the server cursor');
    ok(calls[0].indexOf('query: $q') !== -1, 'the filter is server-side');

    // The fallback: filtered read breaks, search stands in, brand-strict.
    S.__internal.setFetch(function (url, init) {
      var body = init && init.body ? String(init.body) : '';
      if (body.indexOf('RrtBrand') !== -1) return Promise.reject(new Error('down'));
      if (body.indexOf('RrtSearch') !== -1) {
        return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ data: { search: {
          totalCount: 2, pageInfo: { hasNextPage: false, endCursor: null },
          nodes: [
            { id: 'gid://shopify/Product/9', handle: 'apoquel-16', title: 'Zoetis Apoquel 16mg',
              vendor: 'Zoetis', productType: '', tags: [], featuredImage: null,
              priceRange: { minVariantPrice: { amount: '2490.0' }, maxVariantPrice: { amount: '2490.0' } },
              compareAtPriceRange: { minVariantPrice: { amount: '0' } },
              availableForSale: true, totalInventory: 5 },
            { id: 'gid://shopify/Product/10', handle: 'zoetis-brush', title: 'Zoetis Style Brush by Acme',
              vendor: 'Acme', productType: '', tags: [], featuredImage: null,
              priceRange: { minVariantPrice: { amount: '100.0' }, maxVariantPrice: { amount: '100.0' } },
              compareAtPriceRange: { minVariantPrice: { amount: '0' } },
              availableForSale: true, totalInventory: 5 }
          ]
        } } }); } });
      }
      return Promise.reject(new Error('no feed in this test'));
    });
    return S.brandPage('Zoetis', { sort: 'newest' });
  }).then(function (page) {
    eq(page.products.map(function (p) { return p.handle; }), ['apoquel-16'],
      'fallback keeps only the exact brand');
    eq(page.hasMore, false, 'and does not pretend to paginate');
    S.__internal.setFetch(function () { return Promise.reject(new Error('offline')); });
  });
}

/* ---------------------------------------------------------- veg only */
(function () {
  function tile(title, ptype, tags) {
    return S.__internal.wrapProduct({
      id: Math.floor(Math.random() * 1e6), handle: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      title: title, brand: 'B', productType: ptype || '', tags: tags || [],
      descriptionHtml: '', images: [], options: [], partial: true, createdAtMs: null,
      variants: [{ id: 1, title: 'Default Title', optionValues: [], pricePaise: 100,
                   compareAtPaise: null, available: true, imageUrl: null, maxQty: null }]
    });
  }
  var pool = [
    tile('Chicken Jerky Treats', 'Dog Treats'),
    tile('Veg Biscuits For Dogs', 'Dog Treats'),
    tile('Rope Tug Toy', 'Dog Toys'),
    tile('Salmon Oil Supplement', 'Supplements')
  ];
  var vis = S.visibleProducts(pool, { vegOnly: true, sort: 'featured' });
  eq(vis.map(function (p) { return p.title; }),
    ['Veg Biscuits For Dogs', 'Rope Tug Toy'],
    'veg only hides animal-ingredient food, keeps veg food and non-food');
  S.setVegOnly(true);
  eq(S.vegOnly(), true, 'the veg choice persists like the app');
  S.setVegOnly(false);
  eq(S.vegOnly(), false, 'and clears');
})();

/* ------------------------------------------------------- size siblings */
// The vendor lists each size of some products as its own listing. The
// grouper must find the family and nothing but the family.
(function () {
  function tile(title, handle, brand, paise, avail) {
    return S.__internal.wrapProduct({
      id: Math.floor(Math.random() * 1e6), handle: handle, title: title,
      brand: brand, productType: '', tags: [], descriptionHtml: '',
      images: [], options: [], partial: true, createdAtMs: null,
      variants: [{ id: 1, title: 'Default Title', optionValues: [],
                   pricePaise: paise, compareAtPaise: null,
                   available: avail !== false, imageUrl: null, maxQty: null }]
    });
  }
  var cur = tile('Farmina Vet Life UltraHypo Hydrolyzed Fish Monoprotein 12 Kg',
    'ultrahypo-12-kg', 'Vet Life', 1300000);
  var fam = S.sizeSiblings(cur, [
    tile('Farmina Vet Life UltraHypo Hydrolyzed Fish Monoprotein 2 Kg',
      'ultrahypo-2-kg', 'Vet Life', 315000),
    tile('Farmina Vet Life UltraHypo Hydrolyzed Fish Monoprotein 400 Gm',
      'ultrahypo-400-gm', 'Vet Life', 90000, false),
    cur, // the search returns the page's own product too: dedupe
    tile('Farmina Vet Life UltraHypo Cat Hydrolyzed Fish Monoprotein 2 Kg',
      'ultrahypo-cat-2-kg', 'Vet Life', 320000),     // different base
    tile('Royal Canin Hypoallergenic 12 Kg', 'rc-hypo-12', 'Royal Canin', 1100000),
    tile('Farmina Vet Life UltraHypo Hydrolyzed Fish Monoprotein', 'no-size', 'Vet Life', 100)
  ]);
  eq(fam.map(function (m) { return m.label; }), ['400 Gm', '2 Kg', '12 Kg'],
    'size family found and sorted small to large across units');
  eq(fam.map(function (m) { return m.current; }), [false, false, true],
    'the open listing is marked current');
  eq(fam[0].available, false, 'a sold-out size keeps its truth');
  eq(fam[1].handle, 'ultrahypo-2-kg', 'chips link the sibling listings');
  eq(S.sizeSiblings(tile('Just A Toy', 'toy', 'Acme', 500), [cur]), [],
    'no size token, no family');
  eq(S.sizeSiblings(cur, []), [], 'a lone size is not a family');
  eq(S.sizeQuery('Farmina Vet Life UltraHypo Hydrolyzed Fish Monoprotein 12 Kg'),
    'farmina vet life ultrahypo hydrolyzed fish monoprotein',
    'the sibling search asks for the base title');
})();

let cartCreateVars = null;

/* ------------------------------------------- revalidation (stubbed vendor) */

function jsonRes(body, status) {
  return Promise.resolve({
    status: status || 200,
    json: () => Promise.resolve(body)
  });
}

function gqlResponse(data) { return jsonRes({ data }); }

/** Answer like the vendor: feed URLs get feed bodies, everything else the
 *  Storefront API shape. Cart re-checks read /products/{handle}.js - the
 *  same read the app makes before money moves. */
function vendorStub(routes) {
  return function (url) {
    for (const prefix of Object.keys(routes)) {
      if (String(url).indexOf(prefix) === 0) return routes[prefix](String(url));
    }
    throw new Error('unexpected fetch in test: ' + url);
  };
}

// The vendor raised 1 kg to ₹120.00 and sold out of 3 kg since the snapshot.
const movedAjax = {
  id: 7, handle: 'wormer', title: 'Wormer', vendor: 'Acme', type: 'Pharmacy',
  variants: [
    { id: 71, title: '1 kg', option1: '1 kg', price: 12000, available: true },
    { id: 72, title: '3 kg', option1: '3 kg', price: 30000, compare_at_price: 35000, available: false }
  ]
};

S.clearCart();
S.add(full, full.variants[0], 1);
S.add(Object.assign({}, full, { variants: [Object.assign({}, full.variants[1], { available: true })] }),
  Object.assign({}, full.variants[1], { available: true }), 1);

S.__internal.setFetch(vendorStub({ '/pl-api/products/wormer.js': () => jsonRes(movedAjax) }));

S.revalidateCart().then((r) => {
  const types = r.changes.map((c) => c.type).sort();
  eq(types, ['price', 'stock'], 'revalidate reports the price move and the stock-out');
  const priceChange = r.changes.filter((c) => c.type === 'price')[0];
  eq(priceChange.from, 11719, 'price change reports the old paise');
  eq(priceChange.to, 12000, 'price change reports the new paise');
  eq(r.lines[0].pricePaise, 12000, 'line snapshot updated to the live price');
  eq(r.lines[0].previousPricePaise, 11719, 'previous price kept so the cart can say so');
  eq(r.lines[1].available, false, 'sold-out line marked, not deleted');

  // Vendor removed the product entirely: their feed answers 404.
  S.__internal.setFetch(vendorStub({ '/pl-api/products/wormer.js': () => jsonRes({}, 404) }));
  return S.revalidateCart();
}).then((r) => {
  eq(r.changes.filter((c) => c.type === 'gone').length, 1,
    'a removed product reports gone once (already-unavailable lines stay quiet)');

  // Vendor unreachable: snapshots stand, nothing invented.
  S.__internal.setFetch(() => Promise.reject(new Error('offline')));
  return S.revalidateCart();
}).then((r) => {
  eq(r.changes.length, 0, 'an unreachable vendor changes nothing');

  /* ------------------------------------------------- checkout + receipts */

  S.clearCart();
  S.add(full, full.variants[0], 2);

  // The native hand-off: cartCreate carries lines and attribution, and its
  // checkoutUrl lands the buyer straight on payment.
  cartCreateVars = null;
  S.__internal.setFetch(function (url, init) {
    const body = init && init.body ? String(init.body) : '';
    if (body.indexOf('RrtCartCreate') !== -1) {
      cartCreateVars = JSON.parse(body).variables;
      return Promise.resolve({ status: 200, json: () => Promise.resolve({ data: { cartCreate: {
        cart: { checkoutUrl: 'https://www.pets-lifestyle.com/checkouts/cn/abc123' },
        userErrors: []
      } } }) });
    }
    return Promise.reject(new Error('unexpected fetch in checkout test'));
  });
  return S.beginCheckout(S.cart().lines, { fromCart: true });
}).then((handoff) => {
  eq(handoff.native, true, 'the hand-off is a native cart, not a permalink');
  eq(handoff.url, 'https://www.pets-lifestyle.com/checkouts/cn/abc123',
    'and it lands straight on the payment page');
  eq(S.receipts()[0].status, 'handed', 'the receipt records the hand-off itself');
  eq(S.receipts()[0].subtotalPaise, 23438, 'receipt keeps the item subtotal shown');
  eq(S.cart().count, 2, 'the bag is never cleared behind the buyer\u2019s back');
  eq(S.orderStatusUrl(S.receipts()[0]), 'https://www.pets-lifestyle.com/account',
    'order status falls back to the vendor account page');
  ok(!('pendingCheckout' in S) && !('resolvePendingCheckout' in S),
    'nobody gets interrogated about how checkout went');

  // Attribution rides the cart itself.
  const attrs = {};
  (cartCreateVars.input.attributes || []).forEach(a => { attrs[a.key] = a.value; });
  eq(attrs.source, 'RRT website', 'source attribute rides the native cart');
  ok(/^RRT-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{10}$/.test(attrs.rrt_ref),
    'and so does the order reference');
  eq(cartCreateVars.input.lines[0].merchandiseId, 'gid://shopify/ProductVariant/71',
    'lines carry the variant gid');
  eq(cartCreateVars.input.lines[0].quantity, 2, 'and the quantity');

  // Cart API down: the permalink stands in, and nobody loses a sale.
  S.__internal.setFetch(() => Promise.reject(new Error('cart api down')));
  return S.beginCheckout(S.cart().lines, { fromCart: true });
}).then((handoff) => {
  eq(handoff.native, false, 'a Cart API failure falls back');
  ok(handoff.url.indexOf('https://www.pets-lifestyle.com/cart/71:2?') === 0,
    'to the permalink, which always works');
  ok(handoff.url.indexOf('attributes%5Bsource%5D=RRT%20website') !== -1
     || handoff.url.indexOf('attributes[source]=RRT+website') !== -1
     || handoff.url.indexOf('attributes%5Bsource%5D=RRT+website') !== -1,
    'with attribution intact');
  eq(S.receipts().length, 2, 'every hand-off keeps its own receipt');

  S.deleteMyData();
  eq(S.cart().count, 0, 'delete-my-data clears the cart');
  eq(S.receipts().length, 0, 'delete-my-data clears receipts');
  eq(S.saved().length, 0, 'delete-my-data clears saved items');

  /* --------------------------------------------- catalogue transport
   * Regression: reading the whole range through collection(handle:"all")
   * shipped an EMPTY landing grid in production (19 Sep 2026) - through
   * the Storefront API that handle resolves to the merchant's own "all"
   * collection, not Shopify's virtual everything-collection. The catalogue
   * must therefore use the top-level products connection. */
  var captured = [];
  S.__internal.setFetch(function (url, init) {
    captured.push(JSON.parse(init.body));
    return gqlResponse({
      products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [tileNode] },
      collection: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [tileNode] } }
    });
  });
  S.clearResponseCache();
  return S.collectionPage('all', { sort: 'featured' }).then(function (page) {
    var q = captured[captured.length - 1];
    ok(q.query.indexOf('products(first:') !== -1 && q.query.indexOf('collection(handle') === -1,
      'catalogue reads the top-level products connection, never a collection handle');
    ok(q.variables.sortKey === 'BEST_SELLING',
      'catalogue featured order is the store\u2019s best sellers');
    eq(page.products.length, 1, 'catalogue page normalises tiles');
    return S.collectionPage('all', { sort: 'newest' });
  }).then(function () {
    var q = captured[captured.length - 1];
    ok(q.variables.sortKey === 'CREATED_AT' && q.variables.reverse === true,
      'catalogue newest maps to CREATED_AT reversed');
    return S.collectionPage('dog-treats', { sort: 'featured' });
  }).then(function () {
    var q = captured[captured.length - 1];
    ok(q.query.indexOf('collection(handle') !== -1,
      'a real aisle still reads its collection');
    ok(q.variables.sortKey === 'COLLECTION_DEFAULT',
      'aisle featured order is the vendor\u2019s own collection order');
  });
}).then(function () {

  /* -------------------------------------- feed fallback (app's endpoints)
   * When the Storefront API errors - or answers the catalogue with an
   * empty page while the live store lists thousands of products - the shop
   * switches to the vendor's own storefront feeds through the same-origin
   * /pl-api proxy: the byte-identical endpoints the app reads. If
   * pets-lifestyle.com shows it, the shop shows it. */

  var urls = [];
  var feedItem = {
    id: 7, handle: 'wormer', title: 'Wormer', vendor: 'Acme',
    variants: [{ id: 71, title: 'Default Title', price: '158.00', available: true }]
  };
  S.__internal.resetTransport();
  S.clearResponseCache();
  S.__internal.setFetch(function (url) {
    urls.push(String(url));
    if (String(url).indexOf('/pl-api/collections/') === 0) {
      return jsonRes({ products: [feedItem] });
    }
    // The API answers, but with nothing in it.
    return gqlResponse({
      products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      collection: { products: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } }
    });
  });

  eq(S.__internal.transport(), 'sf', 'the API answers first');
  return S.collectionPage('all', { sort: 'featured' }).then(function (page) {
    eq(page.products.length, 1, 'an empty API catalogue falls through to the vendor feed');
    eq(page.products[0].cheapestVariant.pricePaise, 15800, 'feed tile priced from the decimal string');
    ok(page.clientSort, 'feed pages sort on the client');
    eq(page.endCursor, 'fp:2', 'feed catalogue pages by feed cursor');
    ok(urls.some(function (u) {
      return u.indexOf('/pl-api/collections/all/products.json') === 0 &&
        u.indexOf('limit=24') !== -1 && u.indexOf('page=1') !== -1;
    }), 'catalogue feed read is the app\u2019s: 24 a page');
    eq(S.__internal.transport(), 'feeds', 'and the feeds keep the session');

    urls.length = 0;
    return S.collectionPage('all', { after: 'fp:2' });
  }).then(function () {
    ok(urls.length === 1 && urls[0].indexOf('page=2') !== -1 &&
      urls[0].indexOf('/pl-api/') === 0,
      'the feed cursor continues on the feed, no API retry');

    urls.length = 0;
    return S.collectionPage('dog-treats', {});
  }).then(function (page) {
    ok(urls[0].indexOf('/pl-api/collections/dog-treats/products.json') === 0 &&
      urls[0].indexOf('limit=250') !== -1,
      'an aisle on feeds loads whole, like the app\u2019s sort');
    eq(page.hasMore, false, 'a whole aisle has no more pages');

    // A removed aisle is an empty shelf, not an error page.
    S.__internal.setFetch(function () { return jsonRes({}, 404); });
    return S.collectionPage('gone-aisle', {});
  }).then(function (page) {
    ok(page.missing, 'a 404 feed marks the aisle missing');

    // Search-as-you-type is the vendor's own suggest.json, app parameters.
    urls.length = 0;
    S.__internal.setFetch(function (url) {
      urls.push(String(url));
      return jsonRes({ resources: { results: {
        products: [{ id: 5, handle: 'gravy', title: 'Gravy', price_min: '70.00', available: true }],
        collections: [{ handle: 'jerhigh', title: 'JerHigh' }]
      } } });
    });
    S.clearResponseCache();
    return S.suggest('gravy');
  }).then(function (r) {
    ok(urls[0].indexOf('/pl-api/search/suggest.json') === 0 &&
      urls[0].indexOf('resources%5Blimit%5D=10') !== -1 &&
      urls[0].indexOf('unavailable_products%5D=last') !== -1,
      'suggest is the vendor\u2019s suggest.json with the app\u2019s parameters');
    eq(r.products[0].cheapestVariant.pricePaise, 7000, 'suggested product priced');
    eq(r.collections[0].handle, 'jerhigh', 'matching collections offered');
    S.__internal.resetTransport();
  });
}).then(brandPageTests).then(function () {
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}).catch((e) => {
  console.error('  FAIL  unhandled: ' + (e && e.stack || e));
  process.exit(1);
});
