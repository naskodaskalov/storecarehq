// Hourly: snapshot the storefront, diff against the last snapshot, write change-feed rows.

import { createHash } from 'node:crypto';
import { diffSnapshots, probeStore, toSnapshot, type Change, type ProbeResult, type Snapshot } from '@storecare/storefront';
import type { Db, StoreRow } from '../db.ts';

type Probe = (url: string) => Promise<ProbeResult>;

export function limitedReason(r: ProbeResult): string | null {
  if (r.home.blocked) return 'blocked';
  if (r.isShopify && !r.theme) return 'headless';
  if (r.productFeed.status !== 'ok') return 'no_product_feed';
  return null;
}

/** Keywords in a work-log title that explain a detected change of this kind. */
const MATCH_WORDS: Record<string, RegExp> = {
  theme_published: /theme|publish|redesign|homepage|template/i,
  theme_updated: /theme|update|upgrade/i,
  app_added: /app|install|integration/i,
  app_removed: /app|uninstall|remove|clean/i,
  products_added: /product|launch|collection|upload/i,
  products_removed: /product|archive|remove|unpublish/i,
  prices_changed: /price|sale|discount|promo/i,
};

/** Finds the agency's own work entry that likely explains a change, within a day either side. */
export async function matchWorkEntry(db: Db, storeId: string, change: Change, at: Date): Promise<string | null> {
  const { rows } = await db.query<{ id: string; title: string; client_text: string | null }>(
    `select id, title, client_text from public.work_entries
      where store_id = $1 and work_date between ($2::date - 1) and ($2::date + 1)
      order by created_at desc`,
    [storeId, at.toISOString().slice(0, 10)],
  );
  const re = MATCH_WORDS[change.kind];
  const appName = typeof change.details.app === 'string' ? String(change.summary.replace(/ (added|removed)$/, '')) : null;
  const hit = rows.find((r) => {
    const text = `${r.title} ${r.client_text ?? ''}`;
    return (re && re.test(text)) || (appName && text.toLowerCase().includes(appName.toLowerCase()));
  });
  return hit?.id ?? null;
}

export async function runStorefrontDiff(db: Db, store: StoreRow, probe: Probe = (u) => probeStore(u)) {
  const result = await probe(store.public_url);
  const next = toSnapshot(result);

  const { rows: prevRows } = await db.query<{ taken_at: Date; theme: Snapshot['theme']; apps: Snapshot['apps']; products: Snapshot['products'] }>(
    `select taken_at, theme, apps, products from public.storefront_snapshots
      where store_id = $1 order by taken_at desc limit 1`,
    [store.id],
  );

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
        { takenAt: prev.taken_at.toISOString(), theme: prev.theme, apps: prev.apps, products: prev.products },
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

  const reason = limitedReason(result);
  await db.query(`update public.stores set status = $2, limited_reason = $3 where id = $1 and status <> 'paused'`, [
    store.id,
    reason ? 'limited' : 'active',
    reason,
  ]);

  return { result, changes, limitedReason: reason, firstSnapshot: !prevRows.length };
}
