import { test } from 'node:test';
import assert from 'node:assert/strict';
import { approveTestDelivery, sendApprovedTest, testDeliveryConfig, type TestDeliveryConfig } from './outreach-delivery.ts';
import type { TestEmailInput } from './outreach-email.ts';
import type { QuickReport } from './quick-report.ts';
import { newPack, validateProspect } from './outreach.ts';

const now = Date.parse('2026-11-02T10:00:00Z');
const config: TestDeliveryConfig = { apiKey: 'fake-test-key', from: 'StoreCare HQ <support@storecarehq.com>', adminEmail: 'owner@example.com', demo: false };
function input(): TestEmailInput {
  const pack = newPack(validateProspect({ agency_name: 'North Studio', agency_url: 'north.example.com', contact_email: 'prospect@north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work' }));
  pack.reviewed = true; pack.preparedAt = '2026-11-02T10:00:00Z'; pack.draft = 'Hi team,\n\nHere is an illustrative report.';
  pack.report = { ok: true, host: 'store.example.com', url: 'https://store.example.com', checkedAt: pack.preparedAt, sections: [{ title: 'Speed', items: [{ tone: 'good', text: 'Score 74.' }] }] } as QuickReport;
  pack.links = { id: '11111111-1111-4111-8111-111111111111', healthToken: 'a'.repeat(64), sampleToken: 'b'.repeat(64), sourceDigest: 'c'.repeat(64), origin: 'https://app.storecarehq.com', expiresAt: '2026-12-02T10:00:00Z' };
  return { pack, subject: 'Sample report' };
}

test('test transport addresses only the authenticated admin, with report links and no attachments', async () => {
  const value = input(); const approved = approveTestDelivery(value, config, now);
  let calls = 0;
  const request: typeof fetch = async (url, options) => {
    calls++; assert.equal(url, 'https://api.resend.com/emails');
    const payload = JSON.parse(String(options?.body));
    assert.deepEqual(payload.to, ['owner@example.com']);
    assert.equal(payload.reply_to, 'owner@example.com');
    assert.equal(payload.subject, 'Sample report');
    assert.equal(payload.attachments, undefined);
    assert.ok(payload.html.includes(`/outreach/r/${value.pack.links!.healthToken}`));
    assert.ok(payload.text.includes(`/outreach/r/${value.pack.links!.sampleToken}`));
    assert.equal(payload.cc, undefined); assert.equal(payload.bcc, undefined);
    return Response.json({ id: 'test-message-id' });
  };
  assert.deepEqual(await sendApprovedTest(value, approved.token, config, request, now), { state: 'accepted', id: 'test-message-id' });
  assert.equal(calls, 1);
});
test('tampered, stale and expired approvals never reach the provider', async () => {
  const value = input(); const approved = approveTestDelivery(value, config, now);
  let calls = 0; const request: typeof fetch = async () => { calls++; return Response.json({ id: 'unexpected' }); };
  await assert.rejects(sendApprovedTest(value, '', config, request, now), /Approve/);
  await assert.rejects(sendApprovedTest(value, approved.token + 'x', config, request, now), /invalid/);
  await assert.rejects(sendApprovedTest({ ...value, subject: 'Changed' }, approved.token, config, request, now), /changed/);
  await assert.rejects(sendApprovedTest({ ...value, pack: { ...value.pack, draft: 'Edited body' } }, approved.token, config, request, now), /changed/);
  await assert.rejects(sendApprovedTest(value, approved.token, { ...config, adminEmail: 'other@example.com' }, request, now), /changed/);
  await assert.rejects(sendApprovedTest(value, approved.token, config, request, now + 15 * 60_000), /expired/);
  const edited = input(); edited.pack.links = { ...edited.pack.links!, sampleToken: 'd'.repeat(64) };
  await assert.rejects(sendApprovedTest(edited, approved.token, config, request, now), /changed/);
  assert.equal(calls, 0);
});
test('retries and renewed approvals preserve the exact payload and idempotency key', async () => {
  const value = input(); const approved = approveTestDelivery(value, config, now);
  const keys: string[] = [], bodies: string[] = [];
  const request: typeof fetch = async (_, options) => { keys.push(new Headers(options?.headers).get('Idempotency-Key')!); bodies.push(String(options?.body)); if (keys.length === 1) throw new Error('network timeout'); return Response.json({ id: 'same-message' }); };
  assert.equal((await sendApprovedTest(value, approved.token, config, request, now)).state, 'unknown');
  const renewed = approveTestDelivery(value, config, now + 1000);
  assert.equal((await sendApprovedTest(value, renewed.token, config, request, now + 1000)).state, 'accepted');
  assert.equal(keys[0], keys[1]); assert.equal(bodies[0], bodies[1]);
});
test('missing settings and demo mode cannot send; provider errors never claim delivery', async () => {
  assert.throws(() => approveTestDelivery(input(), { ...config, demo: true }, now), /Demo/);
  assert.throws(() => approveTestDelivery(input(), { ...config, apiKey: '' }, now), /RESEND/);
  assert.throws(() => approveTestDelivery(input(), { ...config, from: 'bad\r\nBcc: other@example.com' }, now), /sender/);
  const approval = approveTestDelivery(input(), config, now);
  const failed = await sendApprovedTest(input(), approval.token, config, async () => new Response('private provider details', { status: 403 }), now);
  assert.equal(failed.state, 'failed'); assert.doesNotMatch(JSON.stringify(failed), /private provider details|fake-test-key/);
  assert.equal((await sendApprovedTest(input(), approval.token, config, async () => Response.json({}), now)).state, 'unknown');
  assert.equal(testDeliveryConfig(' Owner@Example.com ', { STORECARE_DEMO: '1' }).adminEmail, 'owner@example.com');
});

test('production sends the requested report to CSV contact_email and keeps replies going to the admin', async () => {
  const value = input();
  const live = testDeliveryConfig('owner@example.com', { RESEND_API_KEY: 'fake-test-key', OUTREACH_FROM: config.from });
  const approval = approveTestDelivery(value, live, now);
  let calls = 0;
  const request: typeof fetch = async (_url, options) => {
    calls++;
    const payload = JSON.parse(String(options?.body));
    assert.deepEqual(payload.to, ['prospect@north.example.com']);
    assert.equal(payload.reply_to, 'owner@example.com');
    assert.equal(payload.cc, undefined); assert.equal(payload.bcc, undefined);
    assert.equal(payload.attachments, undefined);
    return Response.json({ id: 'agency-message-id' });
  };
  assert.equal((await sendApprovedTest(value, approval.token, live, request, now)).state, 'accepted');
  const changed = input(); changed.pack.prospect.contact_email = 'someone-else@example.com';
  await assert.rejects(sendApprovedTest(changed, approval.token, live, request, now), /changed/);
  const testApproval = approveTestDelivery(value, config, now);
  await assert.rejects(sendApprovedTest(value, testApproval.token, live, request, now), /invalid/);
  assert.equal(calls, 1);
  const missing = input(); missing.pack.prospect.contact_email = '';
  assert.throws(() => approveTestDelivery(missing, live, now), /contact_email/);
  const injected = input(); injected.pack.prospect.contact_email = 'victim@example.com\r\nBcc: other@example.com';
  assert.throws(() => approveTestDelivery(injected, live, now));
});
