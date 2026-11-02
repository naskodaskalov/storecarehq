import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COLUMNS, draftMessage, ensureUnique, exportCsv, newPack, parseCsv, restorePacks, serializePacks, validateProspect } from './outreach.ts';
import type { QuickReport } from './quick-report.ts';

const prospect = () => validateProspect({ agency_name: 'North, Studio', agency_url: 'north.example.com', client_store_url: 'store.example.com', portfolio_source_url: 'north.example.com/work', contact_email: 'owner@north.example.com' });
test('CSV supports quoted commas, newlines, escaped quotes and BOM; rejects malformed rows', () => {
  const csv = '\uFEFF' + COLUMNS.join(',') + '\r\n"North, ""Studio""\nTeam",north.example.com,,,owner@north.example.com,store.example.com,north.example.com/work';
  assert.equal(parseCsv(csv)[0].prospect.agency_name, 'North, "Studio"\nTeam');
  assert.throws(() => parseCsv(COLUMNS.join(',') + '\n"unclosed'), /Unclosed/);
  assert.throws(() => parseCsv(COLUMNS.join(',') + '\nshort,row'), /column count/);
  assert.throws(() => parseCsv(COLUMNS.join(',') + '\n"name"bad,a,b,c,d,e,f'), /quoting/);
});
test('requires provenance and safe URLs, detects duplicate domain and email', () => {
  const p = prospect();
  assert.throws(() => validateProspect({ ...p, portfolio_source_url: '' }), /required/);
  assert.throws(() => validateProspect({ ...p, agency_url: 'javascript:alert(1)' }));
  assert.throws(() => validateProspect({ ...p, agency_url: 'https://user:pass@north.example.com' }));
  assert.throws(() => ensureUnique([newPack(p), newPack({ ...p, agency_url: 'https://www.north.example.com' })]), /Duplicate/);
  assert.throws(() => ensureUnique([newPack(p), newPack({ ...p, agency_url: 'https://another.example.com', contact_email: p.contact_email.toUpperCase() })]), /Duplicate/);
});
test('backup preserves edited drafts and workflow states and rejects malformed snapshots', () => {
  const pack = { ...newPack(prospect()), reviewed: true, draft: 'Edited\nmessage', subject: 'Edited subject', status: 'contacted' as const, preparedAt: '2026-11-02T10:00:00Z', report: { ok: false as const, error: 'Blocked' } };
  assert.deepEqual(restorePacks(serializePacks([pack])), [pack]);
  assert.throws(() => restorePacks('{"version":2,"packs":[]}'), /Unsupported/);
  assert.throws(() => restorePacks(serializePacks([{ ...pack, report: { ok: true } as QuickReport }])), /snapshot/);
});
test('spreadsheet summary neutralizes formulas in every user-controlled cell', () => {
  const pack = { ...newPack({ ...prospect(), agency_name: '=IMPORTXML("bad")' }), draft: '\n+formula' };
  const csv = exportCsv([pack]);
  assert.ok(csv.includes('"\'=IMPORTXML(""bad"")"'));
  assert.ok(csv.includes('"\'\n+formula"'));
});
test('drafts use neutral measured scores only; blocked checks are not sales claims', () => {
  const p = prospect();
  const report = { ok: true, checkedAt: '2026-11-02T10:00:00Z', sections: [{ title: 'Speed', items: [{ tone: 'look', text: 'The PageSpeed test did not finish.' }] }] } as QuickReport;
  const draft = draftMessage(p, report);
  assert.doesNotMatch(draft, /One measurement|did not finish|lost sales|broken/);
  assert.match(draft, /fictional data/);
  assert.equal(draftMessage(p, { ok: false, error: 'Blocked' }), '');
  if (report.ok) report.sections[0].items.push({ tone: 'look', text: 'Mobile PageSpeed score 32/100. Slow mobile pages cost sales.' });
  assert.match(draftMessage(p, report), /score 32\/100/);
  assert.doesNotMatch(draftMessage(p, report), /cost sales/);
});
