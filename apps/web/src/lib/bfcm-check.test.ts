import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bfcmLive, handleBfcmCheck } from './bfcm-check.ts';
import { buildBfcmAudit, type BfcmAudit } from './bfcm.ts';

const NOW = Date.parse('2026-11-26T10:00:00Z');
function audit(live: Parameters<typeof buildBfcmAudit>[0]['live']): BfcmAudit {
  return buildBfcmAudit({ kind: 'prospect', storeName: 'Shop', url: 'https://shop.example.com', now: NOW, live, speed: null, ssl: null, domain: null, links: null });
}
const open = { status: 200, ms: 400, blocked: false, page: { password: false, unavailable: false, noindex: null, googleBlocked: false, products: [] }, apps: [], featured: [] } as unknown as Parameters<typeof buildBfcmAudit>[0]['live'];

function request(body: unknown, origin = 'https://www.storecarehq.com') {
  return new Request('https://www.storecarehq.com/api/bfcm-check', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
const config = (run: () => Promise<BfcmAudit | { error: string }> = async () => audit(open), allow = () => true) => ({ run, allow, clientKey: 'k' });

test('shown three weeks before Black Friday through Cyber Monday, hidden otherwise', () => {
  assert.equal(bfcmLive(Date.parse('2026-10-20T12:00:00Z')), false);
  assert.equal(bfcmLive(Date.parse('2026-11-10T12:00:00Z')), true);
  assert.equal(bfcmLive(NOW), true);
  assert.equal(bfcmLive(Date.parse('2026-11-30T12:00:00Z')), true);
  assert.equal(bfcmLive(Date.parse('2026-12-01T12:00:00Z')), false);
});

test('returns the prospect audit for a public store', async () => {
  const res = await handleBfcmCheck(request({ url: 'shop.example.com' }), config());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.audit.kind, 'prospect');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('refuses other origins, internal addresses and visitors over the limit', async () => {
  assert.equal((await handleBfcmCheck(request({ url: 'shop.example.com' }, 'https://evil.example'), config())).status, 403);
  assert.equal((await handleBfcmCheck(request({ url: '127.0.0.1' }), config())).status, 400);
  assert.equal((await handleBfcmCheck(request({ url: '' }), config())).status, 400);
  assert.equal((await handleBfcmCheck(request({ url: 'shop.example.com' }), config(undefined, () => false))).status, 429);
});

test('an unreachable or non-Shopify store is an error the visitor can act on; a crash is a retry', async () => {
  const res = await handleBfcmCheck(request({ url: 'shop.example.com' }), config(async () => ({ error: 'We could not reach shop.example.com.' })));
  assert.equal(res.status, 422);
  assert.equal((await res.json()).error, 'We could not reach shop.example.com.');
  const failing = await handleBfcmCheck(request({ url: 'shop.example.com' }), config(async () => { throw new Error('x'); }));
  assert.equal(failing.status, 502);
});
