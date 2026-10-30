// One function per job type: run the check, recompute health, send alerts.

import { getStore, type Db } from './db.ts';
import { recomputeHealth } from './health.ts';
import { runCheckout } from './jobs/checkout.ts';
import { runSpeed } from './jobs/speed.ts';
import { expiryAlerts, runSite } from './jobs/site.ts';
import { runStorefrontDiff } from './jobs/storefront.ts';
import { runUptime } from './jobs/uptime.ts';
import { draftMonthlyReport } from './jobs/report.ts';
import { defaultSenders, notify, type Alert, type Senders } from './notify.ts';
import { reportPeriodFor } from './schedule.ts';
import { enqueueDelivery, deliverAlerts } from './alert-outbox.ts';
import { createHash } from 'node:crypto';

const APP = () => process.env.APP_URL ?? 'https://app.storecarehq.com';
const appUrl = (storeId: string) => `${APP()}/stores/${storeId}`;

export async function storefrontTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  await runStorefrontDiff(db, store);
  await recomputeHealth(db, store.id);
  // Database triggers save risky-change alerts atomically with each change.
  await deliverAlerts(db);
}

export async function uptimeTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const r = await runUptime(db, store);
  if (r.opened || r.resolved) await deliverAlerts(db);
  if (r.opened || r.resolved) await recomputeHealth(db, store.id);
}

export async function checkoutTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const r = await runCheckout(db, store);
  if ('skipped' in r) return;
  await recomputeHealth(db, store.id);
  await deliverAlerts(db);
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
  const alerts: Alert[] = expiryAlerts(r).map((a) => ({ key: `expiry/${store.id}/${new Date().toISOString().slice(0,10)}/${a.title}`, severity: 'incident', title: a.title, body: a.body, link: appUrl(store.id) }));
  await notify(db, store, alerts);
}

// Monthly reports -----------------------------------------------------------------------------

type Drafted = { agencyId: string; storeName: string; reportId: string; periodLabel: string; periodStart: string };
let drafted: Drafted[] = [];

/** Reports drafted since the last call (the tick runner sends one digest per agency at the end). */
export function takeDrafted(): Drafted[] {
  const out = drafted;
  drafted = [];
  return out;
}

export async function reportTask(db: Db, storeId: string) {
  const store = await getStore(db, storeId);
  if (!store || store.status === 'paused') return;
  const period = reportPeriodFor(store.timezone);
  const r = await draftMonthlyReport(db, store.id, period, { apiKey: process.env.ANTHROPIC_API_KEY });
  if (r.created) drafted.push({ agencyId: store.agency_id, storeName: store.name, reportId: r.reportId, periodLabel: period.label, periodStart: period.start });
}

/** "3 reports are ready to review" to each agency's email and Slack routes, whatever their alert level. */
export async function sendReportDigests(db: Db, items: Drafted[], senders: Senders = defaultSenders): Promise<number> {
  const byAgency = new Map<string, Drafted[]>();
  for (const d of items) byAgency.set(d.agencyId, [...(byAgency.get(d.agencyId) ?? []), d]);
  let sent = 0;
  for (const [agencyId, list] of byAgency) {
    const { rows: routes } = await db.query<{ id: string; channel: 'email' | 'slack'; target: string }>(
      `select distinct on (channel,target) id, channel, target from public.alert_routes where agency_id = $1 and channel in ('email', 'slack') order by channel,target,id`,
      [agencyId],
    );
    const labels = [...new Set(list.map((d) => d.periodLabel))].join(' / ');
    const n = list.length;
    const subject = `${n} ${labels} report${n === 1 ? ' is' : 's are'} ready to review`;
    const lines = list
      .sort((a, b) => a.storeName.localeCompare(b.storeName))
      .map((d) => `• ${d.storeName}: ${APP()}/reports/${d.reportId}`);
    const text = `${subject}.\nThey were drafted from last month's checks, changes and work log. Nothing goes to clients until you approve and send.\n\n${lines.join('\n')}\n\nAll reports: ${APP()}/reports?period=${list[0].periodStart.slice(0, 7)}`;
    const ids: string[] = [];
    const eventKey = `reports/${createHash('sha256').update(list.map(d => d.reportId).sort().join(',')).digest('hex')}`;
    for (const r of routes) {
      const id = await enqueueDelivery(db, { agencyId, routeId: r.id, eventKey, channel: r.channel,
        target: r.target, subject, body: text });
      if (id) ids.push(id);
    }
    sent += await deliverAlerts(db, senders, ids);
  }
  return sent;
}
