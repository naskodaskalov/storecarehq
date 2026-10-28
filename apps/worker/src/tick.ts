// One scheduling pass over every store, then exit. Run every 30 minutes by GitHub Actions
// (.github/workflows/monitor.yml). The always-on alternative is src/index.ts with pg-boss.
//
//   node src/tick.ts            run what is due
//   node src/tick.ts --dry-run  only print what is due

import { activeStores, createPool, type Db, type StoreRow } from './db.ts';
import { dueJobs, type JobName, type LastRuns } from './schedule.ts';
import { checkoutTask, siteTask, speedTask, storefrontTask, uptimeTask } from './tasks.ts';

const TASKS: Record<JobName, (db: Db, storeId: string) => Promise<void>> = {
  uptime: uptimeTask,
  storefront: storefrontTask,
  checkout: checkoutTask,
  speed: speedTask,
  site: siteTask,
};

async function lastRuns(db: Db, storeId: string): Promise<LastRuns> {
  const { rows } = await db.query<{ snapshot_at: Date | null; checkout_at: Date | null; speed_at: Date | null; site_at: Date | null }>(
    `select
       (select max(taken_at) from public.storefront_snapshots where store_id = $1) as snapshot_at,
       (select max(ran_at) from public.checkout_runs where store_id = $1) as checkout_at,
       (select max(sampled_at) from public.speed_samples where store_id = $1) as speed_at,
       (select max(checked_at) from public.site_checks where store_id = $1) as site_at`,
    [storeId],
  );
  return { snapshotAt: rows[0].snapshot_at, checkoutAt: rows[0].checkout_at, speedAt: rows[0].speed_at, siteAt: rows[0].site_at };
}

async function runStore(db: Db, store: StoreRow, dryRun: boolean): Promise<string> {
  const due = dueJobs(store, await lastRuns(db, store.id));
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
      results.push(job === 'speed' ? `speed skipped (${msg})` : `${job} FAILED: ${msg}`);
    }
  }
  return `${store.name}: ${results.join(' · ')}`;
}

const dryRun = process.argv.includes('--dry-run');
const pool = createPool();
const started = Date.now();
try {
  const stores = await activeStores(pool);
  // A few stores at a time; each store's jobs stay in order.
  const queue = [...stores];
  const lines: string[] = [];
  await Promise.all(
    Array.from({ length: Math.min(4, queue.length) }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) lines.push(await runStore(pool, s, dryRun));
    }),
  );
  if (!dryRun) await pool.query('select public.prune_monitoring()');
  for (const l of lines.sort()) console.log(l);
  if (!dryRun && !process.env.PAGESPEED_API_KEY) {
    console.log('::warning::PAGESPEED_API_KEY is not set, so speed checks use Google\'s shared quota and usually fail.');
  }
  console.log(`${stores.length} stores in ${Math.round((Date.now() - started) / 1000)}s`);
  if (lines.some((l) => l.includes('FAILED'))) process.exitCode = 1;
} finally {
  await pool.end();
}
