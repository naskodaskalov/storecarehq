// Alert rule step: jobs write rows; this decides who hears about what.

import type { Db, StoreRow } from './db.ts';

export type Severity = 'info' | 'risky' | 'incident';
const RANK: Record<Severity, number> = { info: 0, risky: 1, incident: 2 };

export type Alert = { severity: Severity; title: string; body: string; link?: string };

type Route = { channel: 'email' | 'slack' | 'sms'; target: string; min_severity: Severity; night_sms: boolean };

export type Senders = {
  email: (to: string, subject: string, text: string) => Promise<void>;
  slack: (webhookUrl: string, text: string) => Promise<void>;
};

export const defaultSenders: Senders = {
  async email(to, subject, text) {
    const key = process.env.RESEND_API_KEY;
    if (!key) return console.warn(`[notify] RESEND_API_KEY not set; would email ${to}: ${subject}`);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.ALERTS_FROM ?? 'StoreCare HQ <alerts@storecarehq.com>', to: [to], subject, text }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  },
  async slack(webhookUrl, text) {
    const res = await fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
    if (!res.ok) throw new Error(`Slack ${res.status}`);
  },
};

export async function routesFor(db: Db, store: StoreRow): Promise<Route[]> {
  const { rows } = await db.query<Route>(
    `select channel, target, min_severity, night_sms from public.alert_routes
      where agency_id = $1 and (store_id is null or store_id = $2)`,
    [store.agency_id, store.id],
  );
  return rows;
}

export async function notify(db: Db, store: StoreRow, alerts: Alert[], senders: Senders = defaultSenders) {
  if (!alerts.length) return 0;
  const routes = await routesFor(db, store);
  let sent = 0;
  for (const a of alerts) {
    for (const r of routes) {
      if (RANK[a.severity] < RANK[r.min_severity]) continue;
      const text = `${store.name}: ${a.title}\n${a.body}${a.link ? `\n${a.link}` : ''}`;
      try {
        if (r.channel === 'email') await senders.email(r.target, `[${store.name}] ${a.title}`, text);
        else if (r.channel === 'slack') await senders.slack(r.target, text);
        else continue; // SMS comes later
        sent++;
      } catch (e) {
        console.error(`[notify] ${r.channel} to ${r.target} failed`, e);
      }
    }
  }
  return sent;
}
