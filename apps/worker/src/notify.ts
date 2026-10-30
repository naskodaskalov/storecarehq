// Alert rule step: jobs write rows; this decides who hears about what.

import type { Db, StoreRow } from './db.ts';

export type Severity = 'info' | 'risky' | 'incident';
const RANK: Record<Severity, number> = { info: 0, risky: 1, incident: 2 };

export type Alert = { severity: Severity; title: string; body: string; link?: string; key?: string };

type Route = { id: string; channel: 'email' | 'slack' | 'sms'; target: string; min_severity: Severity; night_sms: boolean };

export { defaultSenders, type Senders } from './alert-transport.ts';
import { defaultSenders, type Senders } from './alert-transport.ts';
import { enqueueDelivery, deliverAlerts } from './alert-outbox.ts';
import { randomUUID } from 'node:crypto';

export async function routesFor(db: Db, store: StoreRow): Promise<Route[]> {
  const { rows } = await db.query<Route>(
    `select id, channel, target, min_severity, night_sms from public.alert_routes
      where agency_id = $1 and (store_id is null or store_id = $2)`,
    [store.agency_id, store.id],
  );
  return rows;
}

export async function notify(db: Db, store: StoreRow, alerts: Alert[], senders: Senders = defaultSenders) {
  if (!alerts.length) return 0;
  const routes = await routesFor(db, store);
  const ids: string[] = [];
  for (const a of alerts) {
    const key = a.key ?? randomUUID();
    for (const r of routes) {
      if (r.channel === 'sms' || RANK[a.severity] < RANK[r.min_severity]) continue;
      const id = await enqueueDelivery(db, { agencyId: store.agency_id, storeId: store.id,
        routeId: r.id, eventKey: key, channel: r.channel, target: r.target,
        subject: `[${store.name}] ${a.title}`,
        body: `${store.name}: ${a.title}\n${a.body}${a.link ? `\n${a.link}` : ''}` });
      if (id) ids.push(id);
    }
  }
  return deliverAlerts(db, senders, ids);
}
