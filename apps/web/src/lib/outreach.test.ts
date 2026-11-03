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
  assert.doesNotMatch(draft, /stood out|did not finish|lost sales|broken|error page/);
  assert.match(draft, /Nothing urgent came up/);
  assert.equal(draftMessage(p, { ok: false, error: 'Blocked' }), '');
  if (report.ok) report.sections[0].items.push({ tone: 'look', text: 'Mobile PageSpeed score 32/100. Slow mobile pages cost sales.' });
  assert.match(draftMessage(p, report), /scores 32\/100 on Google’s mobile speed test/);
  assert.doesNotMatch(draftMessage(p, report), /cost sales/);
});

test('the draft leads with the most useful measured finding, in plain words, signed by a person', async () => {
  const { headlineFinding } = await import('./outreach.ts');
  const p = { ...prospect(), contact_name: 'Jamie Lee' };
  const report = { ok: true, checkedAt: '2026-11-02T10:00:00Z', sections: [
    { title: 'Speed', items: [{ tone: 'look', text: 'Mobile PageSpeed score 41/100. Main content appeared after 4.8s. Slow mobile pages cost sales.' }] },
    { title: 'Links', items: [{ tone: 'look', text: '3 links from the home page are broken (of 15 checked).' }, { tone: 'look', text: '/pages/old answers 404.' }] },
    { title: 'SSL and domain', items: [{ tone: 'look', text: 'We could not read the SSL certificate (timeout).' }] },
  ] } as QuickReport;
  assert.equal(headlineFinding(report), '3 of the 15 links I checked on the home page return an error page');
  const draft = draftMessage(p, report);
  assert.match(draft, /^Hi Jamie,/);
  assert.match(draft, /I came across .* in your portfolio/);
  assert.match(draft, /One thing stood out: 3 of the 15 links/);
  assert.doesNotMatch(draft, /could not read|cost sales|fictional|StoreCareHQ\n/);
  assert.match(draft, /\n\nNasko\nStoreCare HQ · storecarehq\.com$/);
  if (report.ok) report.sections.splice(1, 1);
  assert.match(headlineFinding(report)!, /^it scores 41\/100 on Google’s mobile speed test, with the main content showing after 4\.8s$/);
  const expiring = { ok: true, checkedAt: 'x', sections: [{ title: 'SSL and domain', items: [{ tone: 'look', text: 'The SSL certificate expires in 6 days (9 Nov 2026). Check it is renewing.' }] }] } as QuickReport;
  assert.equal(headlineFinding(expiring), 'its SSL certificate expires on 9 Nov 2026');
  const fine = { ok: true, checkedAt: 'x', sections: [{ title: 'Speed', items: [{ tone: 'good', text: 'Mobile PageSpeed score 88/100.' }] }] } as QuickReport;
  assert.equal(headlineFinding(fine), null);
});
