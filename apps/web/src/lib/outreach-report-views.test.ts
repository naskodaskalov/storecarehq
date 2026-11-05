import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAutomated, memoryViewStore, openedByPerson, summarizeViews, viewRow, type ReportView } from './outreach-report-views.ts';
import { logReportView } from './outreach-report-views-store.ts';

const chrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const headers = (ua: string | null, extra: Record<string, string> = {}) => new Headers({ ...(ua ? { 'user-agent': ua } : {}), ...extra });

test('people in browsers count as views; mail scanners, previews and scripts are flagged', () => {
  assert.equal(isAutomated(chrome), false);
  assert.equal(isAutomated('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'), false);
  for (const ua of [null, '', 'curl/8.4.0', 'python-requests/2.32', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Microsoft Outlook 16.0; ms-office; MSOffice 16)', 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko Firefox/11.0 (via ggpht.com GoogleImageProxy)', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'])
    assert.equal(isAutomated(ua), true, String(ua));
  assert.equal(isAutomated(chrome, 'prefetch'), true, 'a browser prefetch is not a visit');
  assert.deepEqual(viewRow('s1', 'health', headers(chrome)), { snapshot_id: 's1', kind: 'health', automated: false, user_agent: chrome });
  assert.equal(viewRow('s1', 'sample', headers('x'.repeat(500))).user_agent?.length, 300);
  assert.equal(viewRow('s1', 'sample', headers(chrome, { 'sec-purpose': 'prefetch;prerender' })).automated, true);
});

test('views are summarised per report-link set, counting only people toward opened and dates', () => {
  const v = (snapshot_id: string, kind: ReportView['kind'], viewed_at: string, automated = false): ReportView => ({ snapshot_id, kind, viewed_at, automated });
  const sum = summarizeViews([
    v('a', 'health', '2026-11-03T09:54:00Z', true),
    v('a', 'health', '2026-11-04T08:00:00Z'), v('a', 'health', '2026-11-04T12:00:00Z'), v('a', 'sample', '2026-11-04T10:00:00Z'), v('a', 'health_download', '2026-11-04T11:00:00Z'),
    v('b', 'sample', '2026-11-03T10:00:00Z', true),
  ]);
  assert.deepEqual(sum.get('a'), { health: 2, sample: 1, downloads: 1, automated: 1, first: '2026-11-04T08:00:00Z', last: '2026-11-04T12:00:00Z' });
  assert.deepEqual(sum.get('b'), { health: 0, sample: 0, downloads: 0, automated: 1, first: null, last: null });
  assert.equal(openedByPerson(sum.get('a')), true);
  assert.equal(openedByPerson(sum.get('b')), false, 'a scanner open is not an open');
  assert.equal(openedByPerson(null), false);
});

test('the route logger skips admins and never throws when storage fails', async () => {
  const rows: Parameters<typeof memoryViewStore>[0] = [], store = memoryViewStore(rows, () => '2026-11-05T10:00:00Z');
  await logReportView('s1', 'health', { headers: headers(chrome), admin: true }, store);
  assert.equal(rows.length, 0, 'admin previews are not recorded');
  await logReportView('s1', 'health', { headers: headers(chrome), admin: false }, store);
  assert.equal(rows.length, 1);
  assert.deepEqual(await store.forSnapshots(['s1', 'other']), [{ snapshot_id: 's1', kind: 'health', viewed_at: '2026-11-05T10:00:00Z', automated: false }]);
  await assert.doesNotReject(logReportView('s1', 'sample', { headers: headers(chrome), admin: false }, { record: async () => { throw new Error('no table'); }, forSnapshots: async () => [] }));
});
