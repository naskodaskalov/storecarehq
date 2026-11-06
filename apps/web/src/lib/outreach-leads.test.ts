import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadPack, memoryLeadStore, mergeBackup, outcomeSummary, validLeadChanges, validLeadId } from './outreach-leads.ts';
import { newPack, restorePacks, serializePacks, validateProspect } from './outreach.ts';

const lead = (name: string, domain: string, email = '') => ({ agency_name: name, agency_url: `https://${domain}`, directory_url: '', contact_name: '', contact_email: email, client_store_url: 'https://store.example.com', portfolio_source_url: `https://${domain}/work` });

test('new leads are saved once: repeats, agencies already emailed and invalid rows are skipped with a reason', async () => {
  const store = memoryLeadStore([], [{ agency_domain: 'old.example.com', contact_email: 'jo@old.example.com' }], () => '2026-11-06T09:00:00Z');
  const { outcomes, added } = await store.add([
    { ...lead('North', 'www.north.example.com', 'Hi@North.example.com'), fit_note: ' Sells a care plan ' },
    lead('North again', 'north.example.com'),
    lead('Same contact', 'other.example.com', 'hi@north.example.com'),
    lead('Old', 'old.example.com'),
    lead('Old contact', 'new.example.com', 'jo@old.example.com'),
    { ...lead('No store', 'nostore.example.com'), client_store_url: '' },
  ], 'research', 'routine@storecarehq.com');
  assert.deepEqual(outcomes.map(o => o.outcome.replace(/:.*/, '')), ['added', 'already listed', 'already listed', 'already contacted', 'already contacted', 'invalid']);
  assert.equal(added.length, 1);
  assert.equal(added[0].contact_email, 'hi@north.example.com');
  assert.equal(added[0].fit_note, 'Sells a care plan');
  assert.deepEqual([added[0].status, added[0].reviewed, added[0].source], ['new', false, 'research']);
  assert.equal(outcomeSummary(outcomes), 'Added 1 agency. Skipped 5: North again (already listed), Same contact (already listed), Old (already contacted), Old contact (already contacted), No store (Agency name, agency URL, client store URL and portfolio source URL are required.).');
  await store.update(added[0].id, { reviewed: true, status: 'prepared' });
  assert.deepEqual((await store.list(10)).map(l => [l.reviewed, l.status]), [[true, 'prepared']]);
  await store.remove(added[0].id);
  assert.equal((await store.list(10)).length, 0);
});

test('a saved lead becomes a workspace pack that remembers which lead it is', async () => {
  const { added: [saved] } = await memoryLeadStore().add([{ ...lead('North', 'north.example.com'), fit_note: 'Retainers' }], 'csv', 'a@b.co');
  const pack = leadPack({ ...saved, reviewed: true, status: 'prepared' });
  assert.deepEqual([pack.leadId, pack.fitNote, pack.reviewed, pack.status, pack.report, pack.prospect.agency_name], [saved.id, 'Retainers', true, 'prepared', null, 'North']);
  assert.deepEqual(Object.keys(pack.prospect).sort(), ['agency_name', 'agency_url', 'client_store_url', 'contact_email', 'contact_name', 'directory_url', 'portfolio_source_url']);
});

test('restoring a backup fills in saved leads instead of duplicating them, and returns the rest to be saved', () => {
  const saved = { ...newPack(validateProspect(lead('North', 'north.example.com'))), leadId: '11111111-1111-4111-8111-111111111111', fitNote: 'Retainers' };
  const backup = restorePacks(serializePacks([
    { ...newPack(validateProspect(lead('North (old name)', 'www.north.example.com'))), reviewed: true, status: 'contacted', draft: 'Hi there' },
    newPack(validateProspect(lead('South', 'south.example.com'))),
  ]));
  const merged = mergeBackup([saved], backup);
  assert.equal(merged.packs.length, 1);
  assert.deepEqual([merged.packs[0].leadId, merged.packs[0].fitNote, merged.packs[0].prospect.agency_name, merged.packs[0].draft, merged.packs[0].status], [saved.leadId, 'Retainers', 'North', 'Hi there', 'contacted']);
  assert.deepEqual(merged.changed.map(p => p.leadId), [saved.leadId]);
  assert.deepEqual(merged.unsaved.map(p => p.prospect.agency_name), ['South']);
});

test('only the review tick and a known status can change on a saved lead', () => {
  assert.deepEqual(validLeadChanges({ reviewed: true }), { reviewed: true });
  assert.deepEqual(validLeadChanges({ status: 'replied' }), { status: 'replied' });
  assert.throws(() => validLeadChanges({ status: 'won' }), /status/);
  assert.throws(() => validLeadChanges({ agency_url: 'https://evil.example.com' }), /Invalid change/);
  assert.throws(() => validLeadChanges({}), /Invalid change/);
  assert.ok(validLeadId('11111111-1111-4111-8111-111111111111'));
  assert.ok(!validLeadId("1' or 1=1"));
});
