// Every 5 minutes: is the storefront up? Two failures in a row open a "down" incident.
// A bot challenge is not downtime: it is recorded as ok=false with status, but never opens an incident.

import { politeGet, type FetchResult } from '@storecare/storefront';
import type { Db, StoreRow } from '../db.ts';

type Get = (url: string) => Promise<FetchResult>;

export type UptimeOutcome = { ok: boolean; opened: string | null; resolved: string | null };

export async function runUptime(db: Db, store: StoreRow, get: Get = (u) => politeGet(u, { timeoutMs: 15000 })): Promise<UptimeOutcome> {
  const res = await get(`${store.public_url}/`);
  const down = !res.blocked && (res.status === 0 || res.status >= 500);
  const ok = res.ok && !res.blocked;

  await db.query(
    `insert into public.uptime_checks (store_id, agency_id, checked_at, ok, status, ms) values ($1, $2, now(), $3, $4, $5)`,
    [store.id, store.agency_id, ok, res.status, res.ms],
  );

  let opened: string | null = null;
  let resolved: string | null = null;

  if (down) {
    const { rows } = await db.query<{ ok: boolean; status: number }>(
      `select ok, status from public.uptime_checks where store_id = $1 order by checked_at desc limit 2`,
      [store.id],
    );
    const twoInARow = rows.length === 2 && rows.every((r) => !r.ok && (r.status === 0 || r.status >= 500));
    if (twoInARow) {
      const ins = await db.query<{ id: string }>(
        `insert into public.incidents (store_id, agency_id, kind, cause)
         values ($1, $2, 'down', $3)
         on conflict (store_id, kind) where resolved_at is null do nothing
         returning id`,
        [store.id, store.agency_id, res.error ?? `HTTP ${res.status}`],
      );
      opened = ins.rows[0]?.id ?? null;
    }
  } else if (ok) {
    const upd = await db.query<{ id: string }>(
      `update public.incidents set resolved_at = now()
        where store_id = $1 and kind = 'down' and resolved_at is null returning id`,
      [store.id],
    );
    resolved = upd.rows[0]?.id ?? null;
  }
  return { ok, opened, resolved };
}
