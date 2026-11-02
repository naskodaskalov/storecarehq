import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyGone, buildExport, deleteWorkspace, exportFileName, EXPORT_TABLES, PAGE, type DeleteDeps } from './workspace-data.ts';

test('the export pages through every table, hides Slack webhooks and leaves out raw samples', async () => {
  const calls: string[] = [];
  const work = Array.from({ length: PAGE + 3 }, (_, i) => ({ id: `w${i}` }));
  const read = async (table: keyof typeof EXPORT_TABLES, _c: string, from: number, to: number) => {
    calls.push(`${table}:${from}`);
    if (table === 'work_entries') return work.slice(from, to + 1);
    if (table === 'alert_routes') return [{ channel: 'slack', target: 'https://hooks.slack.com/services/SECRET' }, { channel: 'email', target: 'ops@agency.com' }];
    return [];
  };
  const out = await buildExport({ name: 'Northline' }, read, new Date('2026-11-02T10:00:00Z'));
  assert.equal((out.work_entries as unknown[]).length, PAGE + 3);
  assert.ok(calls.includes(`work_entries:${PAGE}`));
  assert.ok(!JSON.stringify(out).includes('SECRET'));
  assert.equal((out.alert_routes as { target: string }[])[1].target, 'ops@agency.com');
  assert.ok(!('uptime_checks' in out));
  assert.ok(!Object.values(EXPORT_TABLES).some((c) => c.includes('share_token')), 'client report links stay private');
  assert.equal(exportFileName('Copper & Pine Studio', new Date('2026-11-02T10:00:00Z')), 'storecare-copper-pine-studio-2026-11-02.json');
});

function deps(over: Partial<DeleteDeps> = {}) {
  const log: string[] = [];
  const d: DeleteDeps = {
    cancelSubscription: async (id) => void log.push(`cancel ${id}`),
    deleteAgency: async (id) => void log.push(`delete ${id}`),
    otherMemberships: async () => 0,
    deleteUser: async (id) => void log.push(`user ${id}`),
    ...over,
  };
  return { d, log };
}
const input = { agencyId: 'a1', agencyName: 'Northline Studio', subscriptionId: 'sub_1', userId: 'u1', isOwner: true, confirm: ' Northline Studio ' };

test('deleting cancels billing first, then the workspace, then the account when it has no other workspace', async () => {
  const { d, log } = deps();
  assert.deepEqual(await deleteWorkspace(d, input), { ok: true, accountDeleted: true });
  assert.deepEqual(log, ['cancel sub_1', 'delete a1', 'user u1']);
});

test('a member of another workspace keeps their sign-in account', async () => {
  const { d, log } = deps({ otherMemberships: async () => 1 });
  assert.deepEqual(await deleteWorkspace(d, input), { ok: true, accountDeleted: false });
  assert.deepEqual(log, ['cancel sub_1', 'delete a1']);
});

test('nothing is deleted without the owner, the exact name, or a cancelled subscription', async () => {
  for (const [over, d] of [[{ isOwner: false }, deps()], [{ confirm: 'northline' }, deps()], [{}, deps({ cancelSubscription: async () => { throw new Error('stripe down'); } })]] as const) {
    const r = await deleteWorkspace(d.d, { ...input, ...over });
    assert.equal(r.ok, false);
    assert.ok(!d.log.some((l) => l.startsWith('delete')));
  }
});

test('Stripe subscriptions that are already gone count as cancelled', () => {
  assert.ok(alreadyGone({ code: 'resource_missing' }));
  assert.ok(alreadyGone({ message: 'This subscription has already been canceled.' }));
  assert.ok(!alreadyGone({ code: 'api_connection_error', message: 'timeout' }));
});
