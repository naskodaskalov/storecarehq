// Hourly: snapshot the storefront, diff against the last snapshot, write change-feed rows.

import { createHash } from 'node:crypto';
import { diffSnapshots, probeStore, toSnapshot, workEntryExplains, type Change, type ProbeResult, type Snapshot } from '@storecare/storefront';
import type { Db, StoreRow } from '../db.ts';

type Probe = (url: string, opts: { skipProducts: boolean }) => Promise<ProbeResult>;

/** Bot checks come and go; a store is only "limited: blocked" after this many in a row. */
export const BLOCKED_STREAK_LIMIT = 3;
/** The product feed is read once a day; theme and apps every hour. */
export const PRODUCTS_EVERY_MS = 23 * 3600 * 1000;

/** Reason from a readable visit. null = full monitoring. */
export function limitedReason(r: ProbeResult): string | null {
  if (r.isShopify && !r.theme) return 'headless';
  if (r.productFeed.status !== 'ok' && r.productFeed.status !== 'skipped') return 'no_product_feed';
  if (r.productFeed.status === 'skipped' && r.productFeed.reason === 'disallowed by robots.txt') return 'no_product_feed';
  return null;
}

/** Finds the agency's own work entry that likely explains a change, within a day either side. */
export async function matchWorkEntry(db: Db, storeId: string, change: Change, at: Date): Promise<string | null> {
  const { rows } = await db.query<{ id: string; title: string; client_text: string | null }>(
    `select id, title, client_text from public.work_entries
      where store_id = $1 and work_date between ($2::date - 1) and ($2::date + 1)
      order by created_at desc`,
    [storeId, at.toISOString().slice(0, 10)],
  );
  const hit = rows.find((r) => workEntryExplains(change, `${r.title} ${r.client_text ?? ''}`));
  return hit?.id ?? null;
}

type PrevRow = { taken_at: Date; theme: Snapshot['theme']; apps: Snapshot['apps']; products: Snapshot['products'] };

export async function runStorefrontDiff(
  db: Db,
  store: StoreRow,
  probe: Probe = (u, o) => probeStore(u, { skipProducts: o.skipProducts, skipCart: true }),
) {
  const { rows: prevRows } = await db.query<PrevRow>(
    `select taken_at, theme, apps, null::jsonb as products from public.storefront_snapshots
      where store_id = $1 order by taken_at desc limit 1`,
    [store.id],
  );
  // Products are compared with the last snapshot that actually has them.
  const { rows: prevProductRows } = await db.query<{ taken_at: Date; products: Snapshot['products'] }>(
    `select taken_at, products from public.storefront_snapshots
      where store_id = $1 and products is not null order by taken_at desc limit 1`,
    [store.id],
  );
  const lastProducts = prevProductRows[0];
  const skipProducts = !!lastProducts && Date.now() - lastProducts.taken_at.getTime() < PRODUCTS_EVERY_MS;

  const result = await probe(store.public_url, { skipProducts });
  const next = toSnapshot(result);

  const productsHash = next.products
    ? createHash('sha256').update(JSON.stringify(next.products)).digest('hex')
    : null;

  // Skip a snapshot entirely when the page itself could not be read: a blocked visit is not "all apps removed".
  const readable = !result.home.blocked && result.home.status === 200;
  let changes: Change[] = [];
  if (readable) {
    await db.query(
      `insert into public.storefront_snapshots (store_id, agency_id, taken_at, theme, apps, products, products_hash, feed_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        store.id,
        store.agency_id,
        result.checkedAt,
        JSON.stringify(next.theme),
        JSON.stringify(next.apps),
        next.products ? JSON.stringify(next.products) : null,
        productsHash,
        result.productFeed.status,
      ],
    );
    const prev = prevRows[0];
    if (prev) {
      changes = diffSnapshots(
        {
          takenAt: prev.taken_at.toISOString(),
          theme: prev.theme,
          apps: prev.apps,
          products: next.products ? (lastProducts?.products ?? null) : null,
        },
        next,
      );
    }
  }

  const now = new Date(result.checkedAt);
  for (const c of changes) {
    const workEntryId = await matchWorkEntry(db, store.id, c, now);
    await db.query(
      `insert into public.changes (store_id, agency_id, occurred_at, source, kind, summary, details, risky, work_entry_id)
       values ($1, $2, $3, 'detected', $4, $5, $6, $7, $8)`,
      [store.id, store.agency_id, result.checkedAt, c.kind, c.summary, JSON.stringify(c.details), c.risky, workEntryId],
    );
  }

  let reason: string | null;
  if (result.home.blocked) {
    const { rows } = await db.query<{ blocked_streak: number; limited_reason: string | null }>(
      `update public.stores set blocked_streak = blocked_streak + 1 where id = $1 returning blocked_streak, limited_reason`,
      [store.id],
    );
    // Until the streak limit, keep whatever we knew before.
    reason = rows[0].blocked_streak >= BLOCKED_STREAK_LIMIT ? 'blocked' : rows[0].limited_reason;
  } else if (readable) {
    await db.query(`update public.stores set blocked_streak = 0 where id = $1`, [store.id]);
    reason = limitedReason(result);
  } else {
    reason = store.limited_reason; // a network error or 5xx is uptime's business, not a monitoring limit
  }
  await db.query(`update public.stores set status = $2, limited_reason = $3 where id = $1 and status <> 'paused'`, [
    store.id,
    reason ? 'limited' : 'active',
    reason,
  ]);

  return { result, changes, limitedReason: reason, firstSnapshot: !prevRows.length };
}
