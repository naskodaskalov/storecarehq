// One scheduling pass over every store, then exit. Run every 30 minutes by GitHub Actions
// (.github/workflows/monitor.yml). The always-on alternative is src/index.ts with pg-boss.
//
//   node src/tick.ts            run what is due
//   node src/tick.ts --dry-run  only print what is due
//   FORCE=site,speed node src/tick.ts   also run these now, even if not due (manual runs);
//                                         FORCE=report drafts last month's report if it doesn't exist yet

import { activeStores, createPool, type Db, type StoreRow } from './db.ts';
import { dueJobs, type JobName, type LastRuns } from './schedule.ts';
import { runStores } from './run-stores.ts';
import { deliverAlerts } from './alert-outbox.ts';
import { checkoutTask, reportTask, sendReportDigests, siteTask, speedTask, storefrontTask, takeDrafted, uptimeTask } from './tasks.ts';

const TASKS: Record<JobName, (db: Db, storeId: string) => Promise<void>> = {
  uptime: uptimeTask,
  storefront: storefrontTask,
  checkout: checkoutTask,
  speed: speedTask,
  site: siteTask,
  report: reportTask,
};

async function lastRuns(db: Db, storeId: string): Promise<LastRuns> {
  const { rows } = await db.query<{ uptime_at: Date | null; snapshot_at: Date | null; checkout_at: Date | null; speed_at: Date | null; site_at: Date | null; report_periods: string[] }>(
    `select
       (select max(checked_at) from public.uptime_checks where store_id = $1) as uptime_at,
       (select max(taken_at) from public.storefront_snapshots where store_id = $1) as snapshot_at,
       (select max(ran_at) from public.checkout_runs where store_id = $1) as checkout_at,
       (select max(sampled_at) from public.speed_samples where store_id = $1) as speed_at,
       (select max(checked_at) from public.site_checks where store_id = $1) as site_at,
       array(select to_char(period, 'YYYY-MM-DD') from public.reports where store_id = $1 order by period desc limit 6) as report_periods`,
    [storeId],
  );
  return { uptimeAt: rows[0].uptime_at, snapshotAt: rows[0].snapshot_at, checkoutAt: rows[0].checkout_at, speedAt: rows[0].speed_at, siteAt: rows[0].site_at, reportPeriods: rows[0].report_periods };
}

const FORCE = (process.env.FORCE ?? '').split(',').map((s) => s.trim()).filter((s): s is JobName => s in TASKS && s !== 'checkout');

async function runStore(db: Db, store: StoreRow, dryRun: boolean): Promise<string> {
  const scheduled = dueJobs(store, await lastRuns(db, store.id));
  const due = (Object.keys(TASKS) as JobName[]).filter((j) => scheduled.includes(j) || FORCE.includes(j));
  if (dryRun) return `${store.name}: ${due.join(', ')}`;
  const results: string[] = [];
  // Storefront before checkout: the checkout test picks its product from the latest snapshot.
  for (const job of due) {
    const started = Date.now();
    try {
      await TASKS[job](db, store.id);
      results.push(`${job} ok ${Date.now() - started}ms`);
    } catch (e) {
      // One failing job must not stop the others or the other stores.
      const msg = (e instanceof Error ? e.message : String(e)).split('\n')[0].slice(0, 200);
      // Speed data is nice to have; a Google quota or timeout should not mark the whole run failed.
      if (job === 'speed') console.warn(`::warning::Speed check failed for store ${store.id}; it will retry on the next pass.`);
      results.push(job === 'speed' ? `speed skipped (${msg})` : `${job} FAILED: ${msg}`);
    }
  }
  return `${store.name}: ${results.join(' · ')}`;
}

const dryRun = process.argv.includes('--dry-run');
const pool = createPool();
const started = Date.now();
try {
  if (!dryRun) console.log(`Queued alerts accepted: ${await deliverAlerts(pool)}`);
  const stores = await activeStores(pool);
  // Log each store immediately, preserving evidence if a later job or cleanup fails.
  const lines = await runStores(stores, (store) => runStore(pool, store, dryRun));
  if (!dryRun) {
    // One "reports ready" message per agency for everything drafted in this pass.
    const digests = await sendReportDigests(pool, takeDrafted());
    if (digests) console.log(`reports ready: ${digests} notification${digests === 1 ? '' : 's'} sent`);
    console.log(`Queued alerts accepted: ${await deliverAlerts(pool)}`);
    await pool.query('select public.prune_monitoring()');
  }
  if (!dryRun && !process.env.PAGESPEED_API_KEY) {
    console.log('::warning::PAGESPEED_API_KEY is not set, so speed checks use Google\'s shared quota and usually fail.');
  }
  console.log(`${stores.length} stores in ${Math.round((Date.now() - started) / 1000)}s`);
  if (lines.some((l) => l.includes('FAILED'))) process.exitCode = 1;
} finally {
  await pool.end();
}
