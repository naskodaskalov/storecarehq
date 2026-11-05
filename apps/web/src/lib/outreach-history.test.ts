import { test } from 'node:test';
import assert from 'node:assert/strict';
import { agencyDomain, contactDay, contactRow, memoryContactStore, previousContacts, type OutreachContact, type StoredContact } from './outreach-history.ts';
import { approveTestDelivery, deliveryFingerprint, sendApprovedTest, testDeliveryConfig } from './outreach-delivery.ts';
import type { TestEmailInput } from './outreach-email.ts';
import type { QuickReport } from './quick-report.ts';
import { newPack, validateProspect } from './outreach.ts';

const now = Date.parse('2026-11-02T10:00:00Z');
function input(): TestEmailInput {
  const pack = newPack(validateProspect({ agency_name: 'North Studio', agency_url: 'https://www.North.example.com/work', contact_name: 'Jo North', contact_email: 'Prospect@North.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work' }));
  pack.reviewed = true; pack.preparedAt = '2026-11-02T10:00:00Z'; pack.draft = 'Hi Jo,\n\nHere is an illustrative report.';
  pack.report = { ok: true, host: 'store.example.com', url: 'https://store.example.com', checkedAt: pack.preparedAt, sections: [{ title: 'Speed', items: [{ tone: 'good', text: 'Score 74.' }] }] } as QuickReport;
  pack.links = { id: '11111111-1111-4111-8111-111111111111', healthToken: 'a'.repeat(64), sampleToken: 'b'.repeat(64), sourceDigest: 'c'.repeat(64), origin: 'https://app.storecarehq.com', expiresAt: '2026-12-02T10:00:00Z' };
  return { pack, subject: 'Sample report' };
}
const live = testDeliveryConfig('Owner@Example.com', { RESEND_API_KEY: 'fake-test-key', OUTREACH_FROM: 'StoreCare HQ <support@storecarehq.com>' });

test('a sent email becomes a history row keyed by the agency website and the exact email sent', async () => {
  const value = input();
  let key = '';
  const request: typeof fetch = async (_url, options) => { key = new Headers(options?.headers).get('Idempotency-Key')!; return Response.json({ id: 'msg_1' }); };
  const result = await sendApprovedTest(value, approveTestDelivery(value, live, now).token, live, request, now);
  assert.equal(result.state, 'accepted');
  const sent = deliveryFingerprint(value, live);
  assert.equal(key, `outreach-agency/${sent.digest}`, 'the history key is the provider duplicate-prevention key');
  const row = contactRow(value, sent, result as Extract<typeof result, { state: 'accepted' }>, live.adminEmail);
  assert.deepEqual(row, {
    sent_by: 'owner@example.com', agency_name: 'North Studio', agency_domain: 'north.example.com', agency_url: 'https://www.north.example.com/work',
    contact_name: 'Jo North', contact_email: 'prospect@north.example.com', client_store_url: 'https://store.example.com/', subject: 'Sample report',
    body_text: value.pack.draft, report_links_id: value.pack.links!.id, delivery: 'accepted', provider_message_id: 'msg_1', payload_digest: sent.digest,
  });
  const unsure = contactRow(value, sent, { state: 'unknown', error: 'timeout' }, live.adminEmail);
  assert.equal(unsure.delivery, 'unconfirmed');
  assert.equal(unsure.provider_message_id, null);
});

test('an agency counts as contacted by its website (with or without www) or its contact address', () => {
  const at = (sent_at: string, over: Partial<OutreachContact>): OutreachContact => ({ id: sent_at, sent_at, sent_by: 'a@x.com', agency_name: 'X', agency_domain: 'north.example.com', agency_url: 'https://north.example.com/', contact_name: null, contact_email: 'hi@north.example.com', client_store_url: null, subject: 'S', delivery: 'accepted', ...over });
  const history = [
    at('2026-10-01T09:00:00Z', {}),
    at('2026-10-20T09:00:00Z', { agency_domain: 'renamed.example', contact_email: 'jo@north.example.com' }),
    at('2026-10-25T09:00:00Z', { agency_domain: 'south.example', contact_email: 'team@south.example' }),
  ];
  const found = previousContacts({ agency_url: 'https://www.NORTH.example.com/about', contact_email: ' Jo@North.example.com ' }, history);
  assert.deepEqual(found.map((c) => c.sent_at), ['2026-10-20T09:00:00Z', '2026-10-01T09:00:00Z'], 'newest first');
  assert.deepEqual(previousContacts({ agency_url: 'https://west.example', contact_email: '' }, history), []);
  assert.deepEqual(previousContacts({ agency_url: 'not a url', contact_email: 'team@south.example' }, history).length, 1);
  assert.equal(agencyDomain('https://WWW.Studio.example:8443/x'), 'studio.example');
});

test('the same email is recorded once, and a confirmed retry upgrades an unconfirmed row', async () => {
  const rows: StoredContact[] = [];
  let clock = Date.parse('2026-11-02T10:00:00Z');
  const store = memoryContactStore(rows, () => new Date(clock += 60_000).toISOString());
  const value = input(), sent = deliveryFingerprint(value, live);
  const first = await store.record(contactRow(value, sent, { state: 'unknown', error: 'timeout' }, 'owner@example.com'));
  assert.equal(first.delivery, 'unconfirmed');
  const retried = await store.record(contactRow(value, sent, { state: 'accepted', id: 'msg_2' }, 'owner@example.com'));
  assert.equal(retried.id, first.id);
  assert.equal(retried.delivery, 'accepted');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].provider_message_id, 'msg_2');
  // A later duplicate report of the same email never downgrades it.
  assert.equal((await store.record(contactRow(value, sent, { state: 'unknown', error: 'timeout' }, 'owner@example.com'))).delivery, 'accepted');

  const followUp = input(); followUp.pack.draft = 'Hi Jo, following up.';
  await store.record(contactRow(followUp, deliveryFingerprint(followUp, live), { state: 'accepted', id: 'msg_3' }, 'owner@example.com'));
  const listed = await store.list(10);
  assert.equal(listed.length, 2);
  assert.ok(Date.parse(listed[0].sent_at) > Date.parse(listed[1].sent_at), 'newest first');
  assert.equal((await store.list(1)).length, 1);
  for (const key of ['body_text', 'payload_digest', 'provider_message_id']) assert.equal(key in listed[0], false, `${key} stays on the server`);
  // The report-link id is listed for the server to look up report views; loadOutreachHistory drops it before the page.
  assert.equal(listed[0].report_links_id, followUp.pack.links!.id);
});

test('dates show in the admin time zone, the same on the server and in the browser', () => {
  assert.equal(contactDay('2026-11-02T22:30:00Z', 'Europe/Sofia'), '3 Nov 2026');
  assert.equal(contactDay('2026-11-02T22:30:00Z', 'UTC'), '2 Nov 2026');
});
