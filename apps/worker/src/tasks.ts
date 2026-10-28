// One function per job type: run the check, recompute health, send alerts.

import { getStore, type Db } from './db.ts';
import { recomputeHealth } from './health.ts';
import { runCheckout } from './jobs/checkout.ts';
import { runSpeed } from './jobs/speed.ts';
import { expiryAlerts, runSite } from './jobs/site.ts';
import { runStorefrontDiff } from './jobs/storefront.ts';
import { runUptime } from './jobs/uptime.ts';
import { notify, type Alert } from './notify.ts';

const appUrl = (storeId: string) => `${process.env.APP_URL ?? 'https://app.storecarehq.com'}/stores/${storeId}`;

export async function storefrontTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const { changes } = await runStorefrontDiff(db, store);
  await recomputeHealth(db, store.id);
  const alerts: Alert[] = changes
    .filter((c) => c.risky)
    .map((c) => ({ severity: 'risky', title: c.summary, body: 'Detected on the live storefront.', link: appUrl(store.id) }));
  await notify(db, store, alerts);
}

export async function uptimeTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const r = await runUptime(db, store);
  const alerts: Alert[] = [];
  if (r.opened) alerts.push({ severity: 'incident', title: 'Store is down', body: 'Two checks in a row failed.', link: appUrl(store.id) });
  if (r.resolved) alerts.push({ severity: 'incident', title: 'Store is back up', body: 'The latest check passed.', link: appUrl(store.id) });
  await notify(db, store, alerts);
  if (r.opened || r.resolved) await recomputeHealth(db, store.id);
}

export async function checkoutTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const r = await runCheckout(db, store);
  if ('skipped' in r) return;
  await recomputeHealth(db, store.id);
  if (r.opened) {
    const failed = r.results.filter((x) => x.result === 'fail').map((x) => `${x.device}: failed at ${x.failedStep}`).join(', ');
    await notify(db, store, [{ severity: 'incident', title: 'Checkout test failed', body: failed, link: appUrl(store.id) }]);
  }
}

export async function speedTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  await runSpeed(db, store);
  await recomputeHealth(db, store.id);
}

export async function siteTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const r = await runSite(db, store);
  const alerts: Alert[] = expiryAlerts(r).map((a) => ({ severity: 'incident', title: a.title, body: a.body, link: appUrl(store.id) }));
  await notify(db, store, alerts);
}
