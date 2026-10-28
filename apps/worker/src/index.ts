// Worker entry point: pg-boss schedules fan-out jobs, which enqueue one job per store.

import PgBoss from 'pg-boss';
import { activeStores, createPool, dbConfig, type StoreRow } from './db.ts';
import { checkoutTask, reportTask, sendReportDigests, siteTask, speedTask, storefrontTask, takeDrafted, uptimeTask } from './tasks.ts';
import { localDateHour, REPORT_LAST_DAY } from './schedule.ts';

const pool = createPool();
const boss = new PgBoss({ ...dbConfig(), schema: 'pgboss', max: 3 });
boss.on('error', (e) => console.error('[pg-boss]', e));
await boss.start();

type PerStore = { storeId: string };

/** Hour of day in the store's timezone, for "daily at 06:00 store time". */
export function localHour(tz: string, at = new Date()): number {
  try {
    return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(at));
  } catch {
    return at.getUTCHours();
  }
}

const QUEUES = {
  // fan-out (scheduled)
  'tick-5min': null,
  'tick-hourly': null,
  // per store
  uptime: uptimeTask,
  storefront: storefrontTask,
  checkout: checkoutTask,
  speed: speedTask,
  site: siteTask,
  report: reportTask,
} as const;

for (const name of Object.keys(QUEUES)) await boss.createQueue(name);

await boss.schedule('tick-5min', '*/5 * * * *');
await boss.schedule('tick-hourly', '7 * * * *');

const fanOut = async (queue: keyof typeof QUEUES, stores: StoreRow[]) => {
  for (const s of stores) {
    // singletonKey keeps one queued job per store per queue if a run is slow.
    await boss.send(queue, { storeId: s.id } satisfies PerStore, { singletonKey: `${queue}:${s.id}`, retryLimit: 1 });
  }
};

await boss.work('tick-5min', async () => {
  const stores = await activeStores(pool);
  await fanOut('uptime', stores);
  // Stores added since the last hourly tick get their first snapshot within 5 minutes.
  const { rows } = await pool.query<{ id: string }>(
    `select s.id from public.stores s
      where s.status <> 'paused'
        and not exists (select 1 from public.storefront_snapshots x where x.store_id = s.id)`,
  );
  const fresh = new Set(rows.map((r) => r.id));
  await fanOut('storefront', stores.filter((s) => fresh.has(s.id)));
});

await boss.work('tick-hourly', async () => {
  const stores = await activeStores(pool);
  await fanOut('storefront', stores);
  // Daily jobs run in the hour that is 06:00 in each store's timezone.
  const sixAm = stores.filter((s) => localHour(s.timezone) === 6);
  await fanOut('checkout', sixAm.filter((s) => s.checkout_consent_at));
  await fanOut('speed', sixAm);
  await fanOut('site', sixAm);
  // reportTask skips stores whose report for last month already exists.
  await fanOut('report', sixAm.filter((s) => Number(localDateHour(s.timezone, new Date()).date.slice(8)) <= REPORT_LAST_DAY));
  if (new Date().getUTCHours() === 3) await pool.query('select public.prune_monitoring()');
});

for (const [queue, task] of Object.entries(QUEUES)) {
  if (!task) continue;
  // Browser work is heavy: one checkout at a time per worker; light jobs a few at once.
  const batchSize = queue === 'checkout' ? 1 : 4;
  await boss.work<PerStore>(queue, { batchSize }, async (jobs) => {
    for (const job of jobs) await task(pool, job.data.storeId);
    if (queue === 'report') await sendReportDigests(pool, takeDrafted());
  });
}

console.log('[worker] started');

const stop = async () => {
  await boss.stop({ graceful: true });
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
