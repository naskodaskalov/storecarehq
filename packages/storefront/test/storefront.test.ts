import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectApps,
  diffSnapshots,
  isAllowed,
  looksBlocked,
  normalizeStoreUrl,
  parseRobots,
  parseScripts,
  parseTheme,
  type Snapshot,
} from '../src/index.ts';

const HTML = `<!doctype html><html><head>
<script>var Shopify = Shopify || {};
Shopify.shop = "juniper-ash.myshopify.com";
Shopify.theme = {"name":"Dawn – Autumn","id":141234567890,"schema_name":"Dawn","schema_version":"15.2.0","theme_store_id":887,"role":"main"};
</script>
<script src="//juniperandash.com/cdn/shop/t/12/assets/global.js?v=1" defer></script>
<script src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=AbC"></script>
<script src="https://cdn.shopify.com/extensions/0193ab12-3c4d-7e8f-9a0b-1c2d3e4f5a6b/judgeme-reviews-123/assets/loader.js" defer></script>
<script src="https://cdn.shopify.com/extensions/01a2b3c4-aaaa-bbbb-cccc-1234567890ab/1.0.0/assets/widget.js" defer></script>
<script>(function(){function asyncLoad(){var urls = ["https:\\/\\/cdn.some-upsell-app.io\\/loader.js?shop=juniper-ash.myshopify.com","https:\\/\\/static.klaviyo.com\\/onsite\\/js\\/x.js"];}})();</script>
</head><body></body></html>`;

test('parseTheme reads id, name and version', () => {
  const t = parseTheme(HTML);
  assert.equal(t?.id, 141234567890);
  assert.equal(t?.name, 'Dawn – Autumn');
  assert.equal(t?.schemaName, 'Dawn');
  assert.equal(t?.schemaVersion, '15.2.0');
});

test('parseTheme returns null when absent', () => {
  assert.equal(parseTheme('<html></html>'), null);
});

test('parseScripts finds script src, asyncLoad urls and extensions', () => {
  const s = parseScripts(HTML, 'https://juniperandash.com');
  const urls = s.map((x) => x.url);
  assert.ok(urls.includes('https://cdn.some-upsell-app.io/loader.js?shop=juniper-ash.myshopify.com'));
  assert.ok(urls.some((u) => u.startsWith('https://juniperandash.com/cdn/shop/')));
  assert.equal(s.filter((x) => x.via === 'extension').length, 2);
  assert.equal(s.find((x) => x.url.includes('some-upsell'))?.via, 'asyncLoad');
});

test('detectApps names known apps, keys unknown ones, skips the store itself', () => {
  const apps = detectApps(parseScripts(HTML, 'https://juniperandash.com'), 'https://juniperandash.com');
  const names = apps.map((a) => a.name);
  assert.ok(names.includes('Klaviyo'));
  assert.ok(names.includes('Judge.me'));
  assert.ok(names.includes('cdn.some-upsell-app.io'));
  assert.ok(names.includes('App extension (widget.js)'));
  assert.ok(!names.includes('juniperandash.com'));
  assert.equal(apps.find((a) => a.name === 'Klaviyo')?.evidence.length, 2);
});

test('theme app extensions are named by handle and keyed across versions', () => {
  const v1 = 'https://cdn.shopify.com/extensions/01a1795e-3e57-76da-995d-72ab4d976d25/rivo-loyalty-rewards-referrals-832/assets/rivo-app-embed.js';
  const v2 = 'https://cdn.shopify.com/extensions/01a19999-0000-76da-995d-72ab4d976d25/rivo-loyalty-rewards-referrals-833/assets/rivo-app-embed.js';
  const pushowl = 'https://cdn.shopify.com/extensions/01a17c2e-d1d9-74dd-a237-017f4ba90e60/pushowl-349/assets/pushowl-shopify.js';
  const a = detectApps([{ url: pushowl, via: 'extension' }], 'https://x.com');
  assert.deepEqual(a.map((x) => [x.key, x.name]), [['ext-pushowl', 'Pushowl']]);
  const k1 = detectApps([{ url: v1, via: 'extension' }], 'https://x.com')[0].key;
  const k2 = detectApps([{ url: v2, via: 'extension' }], 'https://x.com')[0].key;
  assert.equal(k1, k2);
});

test('shop.app is platform; generic CDNs are reported by host', () => {
  const apps = detectApps(
    [
      { url: 'https://shop.app/checkouts/internal/preloads.js', via: 'script' },
      { url: 'https://d38xvr37kwwhcm.cloudfront.net/js/x.js', via: 'script' },
    ],
    'https://x.com',
  );
  assert.deepEqual(apps.map((a) => a.name), ['Script from d38xvr37kwwhcm.cloudfront.net']);
});

test('robots: longest match wins, wildcards and our own group', () => {
  const r = parseRobots(`User-agent: *\nDisallow: /cart\nDisallow: /*.json$\nAllow: /products.json\n\nUser-agent: SomeOtherBot\nDisallow: /`);
  assert.equal(isAllowed(r, '/'), true);
  assert.equal(isAllowed(r, '/cart.js'), false);
  assert.equal(isAllowed(r, '/collections.json'), false);
  assert.equal(isAllowed(r, '/products.json?limit=250&page=1'), true);
  const mine = parseRobots(`User-agent: *\nDisallow:\n\nUser-agent: StoreCareBot\nDisallow: /\nCrawl-delay: 5`);
  assert.equal(isAllowed(mine, '/'), false);
  assert.equal(mine.crawlDelay, 5);
});

test('looksBlocked spots status codes and challenge pages', () => {
  assert.equal(looksBlocked(429, ''), true);
  assert.equal(looksBlocked(200, '<title>Verifying your connection...</title>'), true);
  assert.equal(looksBlocked(200, '<title>Shop</title>'), false);
});

test('normalizeStoreUrl', () => {
  assert.equal(normalizeStoreUrl('JuniperAndAsh.com/collections/all'), 'https://juniperandash.com');
  assert.equal(normalizeStoreUrl('http://x.myshopify.com'), 'https://x.myshopify.com');
  for (const bad of ['localhost', '127.0.0.1', 'http://169.254.169.254/latest', '10.0.0.5', 'shop.internal', 'x.com:8080', 'user@x.com']) {
    assert.throws(() => normalizeStoreUrl(bad), bad);
  }
});

const base = (over: Partial<Snapshot> = {}): Snapshot => ({
  takenAt: '2026-10-01T00:00:00Z',
  theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.1.0', themeStoreId: 887, role: 'main' },
  apps: [{ key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] }],
  products: Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    handle: `p${i}`,
    title: `Product ${i + 1}`,
    updatedAt: null,
    prices: { [`v${i}`]: '20.00' },
  })),
  ...over,
});

test('diff: theme publish, version update, apps', () => {
  const a = base();
  const b = base({
    theme: { ...a.theme!, id: 2, name: 'Dawn – Autumn' },
    apps: [{ key: 'loox', name: 'Loox', known: true, evidence: ['x'] }],
  });
  const kinds = diffSnapshots(a, b).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ['app_added', 'app_removed', 'theme_published']);
  const c = base({ theme: { ...a.theme!, schemaVersion: '15.2.0' } });
  assert.equal(diffSnapshots(a, c)[0].kind, 'theme_updated');
});

test('diff: bulk price change is grouped and flagged; zero price is suspicious', () => {
  const a = base();
  const products = a.products!.map((p, i) => ({ ...p, prices: { [`v${i}`]: i === 0 ? '0.00' : '25.00' } }));
  const [change] = diffSnapshots(a, base({ products }));
  assert.equal(change.kind, 'prices_changed');
  assert.equal(change.summary, 'Prices changed on 12 products');
  assert.equal(change.risky, true);
  assert.equal((change.details.suspicious as unknown[]).length, 1);
});

test('stock: sold-out variants are recorded and stock changes logged', async () => {
  const { toLite, isOutOfStock } = await import('../src/index.ts');
  const p = toLite({ id: 1, handle: 'h', title: 'Candle', variants: [{ id: 11, price: '9.00', available: false }, { id: 12, price: '9.00', available: true }] });
  assert.deepEqual(p.soldOut, ['11']);
  assert.equal(isOutOfStock(p), false);
  const out = toLite({ id: 1, handle: 'h', title: 'Candle', variants: [{ id: 11, price: '9.00', available: false }, { id: 12, price: '9.00', available: false }] });
  assert.equal(isOutOfStock(out), true);

  const a = base({ products: [p] });
  const b = base({ products: [out] });
  assert.deepEqual(diffSnapshots(a, b).map((c) => c.summary), ['Out of stock: Candle']);
  assert.deepEqual(diffSnapshots(b, a).map((c) => c.summary), ['Back in stock: Candle']);
  // Old snapshots without stock data never produce stock changes.
  const legacy = base({ products: [{ ...p, soldOut: undefined }] });
  assert.deepEqual(diffSnapshots(legacy, b), []);
});

test('site: registrable domain, internal links, broken link check', async () => {
  const { registrableDomain, internalLinks, findBrokenLinks, daysUntil } = await import('../src/index.ts');
  assert.equal(registrableDomain('www.juniperandash.com'), 'juniperandash.com');
  assert.equal(registrableDomain('shop.example.co.uk'), 'example.co.uk');
  const html = `<a href="/collections/all">All</a><a href="/products/candle?variant=1">C</a><a href="/cart">Cart</a>
    <a href="https://other.com/x">x</a><a href="/pages/about/">About</a><a href="#top">t</a><a href="/products/candle">dup</a>`;
  assert.deepEqual(internalLinks(html, 'https://shop.com/'), ['https://shop.com/collections/all', 'https://shop.com/products/candle', 'https://shop.com/pages/about']);
  const fake = (async (url: string) => ({ url, status: url.endsWith('about') ? 404 : 200, ok: !url.endsWith('about'), headers: {}, body: '', ms: 1, blocked: false })) as never;
  const r = await findBrokenLinks(html, 'https://shop.com/', { get: fake, gapMs: 0 });
  assert.deepEqual(r, { checked: 3, broken: [{ url: 'https://shop.com/pages/about', status: 404 }] });
  assert.equal(daysUntil(new Date(Date.now() + 10.5 * 864e5).toISOString()), 10);
  assert.equal(daysUntil(null), null);
});

test('diff: products added and removed; unreadable feed produces no product changes', () => {
  const a = base();
  const products = [...a.products!.slice(1), { id: 99, handle: 'new', title: 'New', updatedAt: null, prices: {} }];
  const kinds = diffSnapshots(a, base({ products })).map((c) => c.kind).sort();
  assert.deepEqual(kinds, ['products_added', 'products_removed']);
  assert.deepEqual(diffSnapshots(a, base({ products: null })), []);
});
