import type { Db } from './db.ts';
import { defaultSenders, DeliveryError, type Senders } from './alert-transport.ts';

type Delivery = { id: string; channel: 'email' | 'slack'; target: string; subject: string; body: string;
  attempts: number; lease_token: string; created_at: Date };
export type Enqueue = { agencyId: string; storeId?: string; routeId: string; eventKey: string;
  channel: 'email' | 'slack'; target: string; subject: string; body: string };

export async function enqueueDelivery(db: Db, d: Enqueue): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.alert_deliveries(agency_id,store_id,route_id,event_key,channel,target,subject,body)
     values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (agency_id,event_key,channel,target) do nothing returning id`,
    [d.agencyId, d.storeId ?? null, d.routeId, d.eventKey, d.channel, d.target, d.subject, d.body]);
  return rows[0]?.id ?? null;
}

/** Atomic leases prevent concurrent workers from sending the same queued message. */
export async function deliverAlerts(db: Db, senders: Senders = defaultSenders, ids?: string[], limit = 50) {
  if (ids && !ids.length) return 0;
  let sent = 0;
  // Removed or edited routes must not receive queued messages for their previous destination.
  await db.query(`update public.alert_deliveries d set status='cancelled',lease_token=null
    where status in ('pending','retry','sending') and not exists
      (select 1 from public.alert_routes r where r.id=d.route_id and r.agency_id=d.agency_id
        and r.channel=d.channel and r.target=d.target)`);
  for (let i = 0; i < limit; i++) {
    const { rows: [d] } = await db.query<Delivery>(
      `with due as (select id from public.alert_deliveries
        where status in ('pending','retry','sending') and next_attempt_at<=now()
          and ($1::uuid[] is null or id=any($1))
        order by next_attempt_at,created_at for update skip locked limit 1)
       update public.alert_deliveries d set status='sending',attempts=attempts+1,
         lease_token=gen_random_uuid(),next_attempt_at=now()+interval '5 minutes'
       from due where d.id=due.id returning d.*`, [ids ?? null]);
    if (!d) break;
    let error: string | null = null;
    let permanent = false;
    try {
      // Resend deduplicates for 24h. Stop before that expires, including after a long worker outage.
      if (d.attempts > 6 || Date.now() - d.created_at.getTime() >= 23 * 60 * 60_000) {
        throw new DeliveryError('Delivery expired after repeated failures or a long delay.', true);
      }
      if (d.channel === 'email') await senders.email(d.target, d.subject, d.body, `storecare-alert/${d.id}`);
      else await senders.slack(d.target, d.body);
    } catch (e) {
      // Never persist arbitrary fetch errors: they can contain webhook secrets or credentials.
      error = e instanceof DeliveryError ? e.message : 'Delivery request failed or timed out.';
      permanent = e instanceof DeliveryError && e.permanent;
    }
    if (!error) {
      await db.query(`update public.alert_deliveries set status='sent',sent_at=now(),last_error=null,lease_token=null
        where id=$1 and lease_token=$2`, [d.id, d.lease_token]);
      sent++;
    } else {
      const failed = permanent || d.attempts >= 6;
      const minutes = [5, 15, 60, 180, 360][Math.min(d.attempts - 1, 4)];
      await db.query(`update public.alert_deliveries set status=$3,last_error=$4,lease_token=null,
        next_attempt_at=now()+($5 * interval '1 minute') where id=$1 and lease_token=$2`,
      [d.id, d.lease_token, failed ? 'failed' : 'retry', error, minutes]);
      console.warn(`::warning::Alert delivery ${d.id} ${failed ? 'failed' : 'will retry'} (${d.channel}).`);
    }
  }
  return sent;
}
