import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, toSnapshot, type ProbeResult, type ProductLite } from '@storecare/storefront';
import { fingerprint } from './scan.ts';
import { diffFingerprints, forgetStore, forgetStores, loadStores, MAX_STORES, remember, saveStore, whenLabel, type Fingerprint, type StoreMemory } from './store-memory.ts';

const product = (id: number, prices: Record<string, string>, soldOut: string[] = [], title = `Product ${id}`): ProductLite => ({
  id,
  handle: `p${id}`,
  title,
  updatedAt: null,
  prices,
  soldOut,
});

function probe(over: Partial<ProbeResult> = {}, products: ProductLite[] | null = [], truncated = false): ProbeResult {
  return {
    input: 'shop.example.com',
    baseUrl: 'https://shop.example.com',
    finalUrl: 'https://shop.example.com/',
    checkedAt: '2026-10-29T09:00:00Z',
    home: { status: 200, ms: 400, blocked: false },
    isShopify: true,
    theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' },
    apps: [
      { key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] },
      { key: 'hotjar', name: 'Hotjar', known: true, evidence: [] },
    ],
    scriptCount: 10,
    productFeed: products ? { status: 'ok', products, pages: 1, truncated } : { status: 'blocked', httpStatus: 403 },
    cartJs: { status: 'skipped', reason: 'not requested' },
    robots: { found: true, homeAllowed: true, productsAllowed: true, cartAllowed: true },
    ...over,
  };
}

const before = probe({}, [
  product(1, { a: '20.00', b: '20.00' }),
  product(2, { c: '35.00' }),
  product(3, { d: '12.00' }, ['d'], 'Coastline One-Piece'),
  product(4, { e: '40.00' }),
  product(5, { f: '18.00' }),
]);
const after = probe(
  {
    checkedAt: '2026-11-04T09:00:00Z',
    theme: { id: 1, name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.1.0', themeStoreId: 887, role: 'main' },
    apps: [
      { key: 'klaviyo', name: 'Klaviyo', known: true, evidence: [] },
      { key: 'smile-io', name: 'Smile.io', known: true, evidence: [] },
    ],
  },
  [
    product(1, { a: '22.00', b: '20.00' }),
    product(2, { c: '35.00' }, ['c'], 'Ferro Espresso Blend'),
    product(3, { d: '12.00' }, [], 'Coastline One-Piece'),
    product(4, { e: '44.00' }),
    product(6, { g: '9.00' }),
  ],
);

test('fingerprint changes read exactly like the product’s own change feed', () => {
  const ours = diffFingerprints(fingerprint(before), fingerprint(after)).map(({ kind, summary, risky }) => ({ kind, summary, risky }));
  const product = diffSnapshots(toSnapshot(before), toSnapshot(after)).map(({ kind, summary, risky }) => ({ kind, summary, risky }));
  assert.deepEqual(ours, product);
  assert.deepEqual(ours.map((c) => c.summary), [
    'Theme updated to Dawn 15.1.0',
    'Smile.io added',
    'Hotjar removed',
    '1 new product published',
    '1 product unpublished or deleted',
    'Prices changed on 2 products',
    'Out of stock: Ferro Espresso Blend',
    'Back in stock: Coastline One-Piece',
  ]);
});

test('a new live theme and a bulk price edit are flagged, as in the product', () => {
  const many = Array.from({ length: 12 }, (_, i) => product(i + 1, { [`v${i}`]: '10.00' }));
  const repriced = many.map((p) => ({ ...p, prices: Object.fromEntries(Object.keys(p.prices).map((k) => [k, '11.00'])) }));
  const a = fingerprint(probe({}, many));
  const b = fingerprint(probe({ theme: { id: 2, name: 'Spring', schemaName: 'Dawn', schemaVersion: '15.0.0', themeStoreId: 887, role: 'main' } }, repriced));
  const changes = diffFingerprints(a, b);
  assert.deepEqual(changes.map((c) => [c.summary, c.risky]), [['New live theme: "Spring"', true], ['Prices changed on 12 products', true]]);
});

test('products missing from page one of a large catalogue are not reported as added or removed', () => {
  const a = fingerprint(probe({}, [product(1, { a: '1.00' }), product(2, { b: '1.00' })], true));
  const b = fingerprint(probe({}, [product(1, { a: '1.00' }), product(3, { c: '1.00' })], true));
  assert.deepEqual(diffFingerprints(a, b), []);
});

test('a blocked or unreadable check changes nothing and keeps the last readable baseline', () => {
  const first = remember(undefined, 'shop.example.com', 'Shop', fingerprint(before));
  const blocked = fingerprint(probe({ checkedAt: '2026-11-02T09:00:00Z', home: { status: 403, ms: 300, blocked: true }, theme: null, apps: [], productFeed: { status: 'skipped', reason: 'home page not readable' } }));
  const second = remember(first.memory, 'shop.example.com', null, blocked);
  assert.deepEqual(second.found, []);
  assert.equal(second.memory.last.apps.length, 2);
  assert.ok(second.memory.last.feed);
  assert.equal(second.memory.name, 'Shop');
  const third = remember(second.memory, 'shop.example.com', null, fingerprint(after));
  assert.equal(third.found.length, 8, 'the next readable check still compares with the last readable one');
  assert.equal(third.memory.looks.length, 3);
  assert.equal(third.memory.changes.length, 8);
  assert.ok(third.memory.changes.every((c) => c.at === '2026-11-04T09:00:00Z'));
});

test('checking again within ten minutes is the same look', () => {
  const first = remember(undefined, 'shop.example.com', null, fingerprint(before));
  const again = remember(first.memory, 'shop.example.com', null, { ...fingerprint(before), at: '2026-10-29T09:06:00Z' });
  assert.deepEqual(again.memory.looks, ['2026-10-29T09:00:00Z']);
  const later = remember(again.memory, 'shop.example.com', null, { ...fingerprint(before), at: '2026-10-29T09:30:00Z' });
  assert.equal(later.memory.looks.length, 2);
});

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const mem = (host: string, at: string): StoreMemory => ({ host, name: null, looks: [at], last: { ...(fingerprint(before) as Fingerprint), at }, changes: [] });

test('stores are kept most recent first, capped, and forgotten on request', () => {
  const s = memoryStorage();
  for (let i = 0; i < MAX_STORES + 2; i++) saveStore(mem(`s${i}.com`, `2026-10-${String(10 + i).padStart(2, '0')}T09:00:00Z`), s);
  const list = loadStores(s);
  assert.equal(list.length, MAX_STORES);
  assert.equal(list[0].host, `s${MAX_STORES + 1}.com`);
  saveStore(mem('s3.com', '2026-11-01T09:00:00Z'), s);
  assert.equal(loadStores(s)[0].host, 's3.com');
  assert.equal(loadStores(s).filter((m) => m.host === 's3.com').length, 1);
  forgetStore('s3.com', s);
  assert.equal(loadStores(s).length, MAX_STORES - 1);
  assert.ok(!loadStores(s).some((m) => m.host === 's3.com'));
  forgetStores(s);
  assert.deepEqual(loadStores(s), []);
});

test('blocked, full or corrupted storage never breaks the page', () => {
  const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('quota'); }, removeItem: () => { throw new Error('denied'); } };
  assert.deepEqual(loadStores(broken), []);
  assert.doesNotThrow(() => saveStore(mem('a.com', '2026-11-01T09:00:00Z'), broken));
  assert.doesNotThrow(() => forgetStores(broken));
  assert.deepEqual(loadStores(null), []);
  const s = memoryStorage();
  s.setItem('storecare:checked-stores:v1', '{"v":1,"stores":[{"host":"x.com"},null,"junk"]}');
  assert.deepEqual(loadStores(s), []);
  s.setItem('storecare:checked-stores:v1', 'not json');
  assert.deepEqual(loadStores(s), []);
});

test('when a store was last checked reads naturally', () => {
  const now = new Date(2026, 10, 4, 15, 0);
  assert.equal(whenLabel(new Date(2026, 10, 4, 9, 0).toISOString(), now), 'earlier today');
  assert.equal(whenLabel(new Date(2026, 10, 3, 22, 0).toISOString(), now), 'yesterday');
  assert.equal(whenLabel(new Date(2026, 9, 29, 9, 0).toISOString(), now), 'on 29 Oct');
});
