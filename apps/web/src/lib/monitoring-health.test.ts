import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleMonitoringHealth, type Freshness } from './monitoring-health.ts';
import { hostRouting, sessionRouting, MONITORING_HEALTH_PATH } from './domains.ts';

const fresh: Freshness = { eligible: 3, stale: 0, last_check_minutes: 12, waiting_health_checks: 0 };
const req = (q = '') => new Request(`https://app.storecarehq.com/api/health/monitoring${q}`);

test('healthy monitoring answers 200 and says nothing about stores', async () => {
  const res = await handleMonitoringHealth(req(), { read: async () => fresh });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, problem: null, last_check_minutes: 12 });
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('stale stores, stuck health checks or an unreadable database answer 503', async () => {
  assert.equal((await handleMonitoringHealth(req(), { read: async () => ({ ...fresh, stale: 1 }) })).status, 503);
  assert.equal((await handleMonitoringHealth(req(), { read: async () => ({ ...fresh, waiting_health_checks: 2 }) })).status, 503);
  const down = await handleMonitoringHealth(req(), { read: async () => { throw new Error('private detail'); } });
  assert.equal(down.status, 503);
  assert.ok(!JSON.stringify(await down.json()).includes('private'));
});

test('no eligible stores yet is healthy', async () => {
  assert.equal((await handleMonitoringHealth(req(), { read: async () => ({ eligible: 0, stale: 0, last_check_minutes: null, waiting_health_checks: 0 }) })).status, 200);
});

test('an optional token guards the endpoint', async () => {
  let read = 0;
  const config = { token: 's3cret', read: async () => { read++; return fresh; } };
  assert.equal((await handleMonitoringHealth(req(), config)).status, 401);
  assert.equal(read, 0);
  assert.equal((await handleMonitoringHealth(req('?token=s3cret'), config)).status, 200);
});

test('the endpoint answers on every host without a session', () => {
  for (const host of ['www.storecarehq.com', 'storecarehq.com', 'app.storecarehq.com', 'localhost:3000']) {
    assert.equal(hostRouting(host, MONITORING_HEALTH_PATH), null);
    assert.equal(sessionRouting(host, MONITORING_HEALTH_PATH, false), null);
  }
});
