import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryReportStore, publishReportLinks, readPublicReport, requireSavedReports, revokeReportLinks, tokenHash, type SnapshotRow } from './outreach-report-links.ts';
import type { TestEmailInput } from './outreach-email.ts';
import { newPack, validateProspect } from './outreach.ts';
import type { QuickReport } from './quick-report.ts';
const now = Date.parse('2026-11-02T10:00:00Z'), owner = 'admin@example.com', origin = 'https://app.storecarehq.com';
function input(): TestEmailInput {
  const pack = newPack(validateProspect({ agency_name: 'North Studio', agency_url: 'north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work', contact_email: 'private-prospect@example.com' }));
  Object.assign(pack, { reviewed: true, preparedAt: '2026-11-02T10:00:00Z', draft: 'Private email draft', report: { ok: true, host: 'store.example.com', url: 'https://store.example.com', checkedAt: '2026-11-02T10:00:00Z', sections: [{ title: 'Speed', items: [{ tone: 'good', text: 'Measured score 74.' }] }] } as QuickReport });
  return { pack, subject: 'Private subject' };
}
test('publishing stores only hashed bearer tokens and public report content; tokens project separate reports', async () => {
  const rows = new Map<string, SnapshotRow>(), store = memoryReportStore(rows), value = input();
  const links = await publishReportLinks(value, owner, store, origin, now);
  assert.equal(rows.size, 1);
  assert.notEqual(links.healthToken, links.sampleToken);
  const saved = JSON.stringify([...rows.values()]);
  for (const privateValue of [links.healthToken, links.sampleToken, value.pack.draft, value.subject, value.pack.prospect.contact_email]) assert.ok(!saved.includes(privateValue));
  const health = await readPublicReport(links.healthToken, store, now), sample = await readPublicReport(links.sampleToken, store, now);
  assert.equal(health?.kind, 'health'); assert.equal(sample?.kind, 'sample');
  assert.doesNotMatch(JSON.stringify(health), /owner_email|admin@example.com|sample_hash|sample-monthly-report/);
  assert.doesNotMatch(JSON.stringify(sample), /owner_email|Measured score 74|health_hash/);
  assert.match(JSON.stringify(sample), /ILLUSTRATIVE SAMPLE/);
  value.pack.links = links;
  assert.deepEqual(await requireSavedReports(value, owner, store, origin, now), value);
});
test('expired, revoked, malformed and unknown tokens fail for public views and download projections', async () => {
  const store = memoryReportStore(), value = input();
  const links = await publishReportLinks(value, owner, store, origin, now); value.pack.links = links;
  assert.equal(await readPublicReport('bad', store, now), null);
  assert.equal(await readPublicReport('f'.repeat(64), store, now), null);
  assert.equal(await readPublicReport(links.healthToken, store, Date.parse(links.expiresAt)), null);
  await assert.rejects(requireSavedReports(value, owner, store, origin, Date.parse(links.expiresAt)), /expired/);
  await revokeReportLinks(links.id, owner, store, now + 1000);
  assert.equal(await readPublicReport(links.healthToken, store, now + 1000), null);
  assert.equal(await readPublicReport(links.sampleToken, store, now + 1000), null);
  await assert.rejects(requireSavedReports(value, owner, store, origin, now + 1000), /revoked/);
});
test('changed reports, other admins and imported/forged references cannot approve saved links', async () => {
  const store = memoryReportStore(), value = input();
  const links = await publishReportLinks(value, owner, store, origin, now); value.pack.links = links;
  await assert.rejects(requireSavedReports(value, 'other@example.com', store, origin, now), /another admin/);
  await assert.rejects(revokeReportLinks(links.id, 'other@example.com', store, now), /this admin/);
  value.pack.links = { ...links, origin: 'https://attacker.example.com' };
  await assert.rejects(requireSavedReports(value, owner, store, origin, now), /changed/);
  value.pack.links = { ...links, sampleToken: links.healthToken };
  await assert.rejects(requireSavedReports(value, owner, store, origin, now), /changed/);
  value.pack.links = links;
  if (value.pack.report?.ok) value.pack.report.sections[0].items[0].text = 'Changed finding';
  await assert.rejects(requireSavedReports(value, owner, store, origin, now), /changed/);
  const published = await readPublicReport(links.healthToken, store, now);
  assert.match(JSON.stringify(published), /Measured score 74/);
  assert.doesNotMatch(JSON.stringify(published), /Changed finding/);
  assert.equal(tokenHash(links.healthToken).length, 64);
});
