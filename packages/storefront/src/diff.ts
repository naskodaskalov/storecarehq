// Compares two storefront snapshots and produces change-feed entries.

import type { DetectedApp, ThemeInfo } from './page.ts';
import type { ProductLite } from './products.ts';

export type Snapshot = {
  takenAt: string;
  theme: ThemeInfo | null;
  apps: DetectedApp[];
  /** null when the product feed could not be read this time (blocked or missing). */
  products: ProductLite[] | null;
};

export type ChangeKind =
  | 'theme_published'
  | 'theme_updated'
  | 'app_added'
  | 'app_removed'
  | 'products_added'
  | 'products_removed'
  | 'prices_changed';

export type Change = {
  kind: ChangeKind;
  summary: string;
  risky: boolean;
  details: Record<string, unknown>;
};

/** A price edit touching at least this many products is grouped and flagged as a bulk change. */
export const BULK_THRESHOLD = 10;

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

export function diffSnapshots(prev: Snapshot, next: Snapshot): Change[] {
  const changes: Change[] = [];

  // Theme
  if (prev.theme && next.theme) {
    if (prev.theme.id !== next.theme.id) {
      changes.push({
        kind: 'theme_published',
        summary: `New live theme: "${next.theme.name ?? 'Untitled'}"`,
        risky: true,
        details: { from: prev.theme, to: next.theme },
      });
    } else if (prev.theme.schemaVersion !== next.theme.schemaVersion && next.theme.schemaVersion) {
      changes.push({
        kind: 'theme_updated',
        summary: `Theme updated to ${next.theme.schemaName ?? 'version'} ${next.theme.schemaVersion}`,
        risky: true,
        details: { from: prev.theme.schemaVersion, to: next.theme.schemaVersion },
      });
    }
  }

  // Apps
  const before = new Map(prev.apps.map((a) => [a.key, a]));
  const after = new Map(next.apps.map((a) => [a.key, a]));
  for (const [key, app] of after) {
    if (!before.has(key)) {
      changes.push({
        kind: 'app_added',
        summary: `${app.name} added`,
        risky: false,
        details: { app: key, evidence: app.evidence },
      });
    }
  }
  for (const [key, app] of before) {
    if (!after.has(key)) {
      changes.push({
        kind: 'app_removed',
        summary: `${app.name} removed`,
        risky: false,
        details: { app: key },
      });
    }
  }

  // Products (only when both sides were readable)
  if (prev.products && next.products) {
    const p0 = new Map(prev.products.map((p) => [p.id, p]));
    const p1 = new Map(next.products.map((p) => [p.id, p]));
    const added = next.products.filter((p) => !p0.has(p.id));
    const removed = prev.products.filter((p) => !p1.has(p.id));
    if (added.length) {
      changes.push({
        kind: 'products_added',
        summary: `${plural(added.length, 'new product')} published`,
        risky: false,
        details: { products: added.map((p) => ({ id: p.id, title: p.title })) },
      });
    }
    if (removed.length) {
      changes.push({
        kind: 'products_removed',
        summary: `${plural(removed.length, 'product')} unpublished or deleted`,
        risky: removed.length >= BULK_THRESHOLD,
        details: { products: removed.map((p) => ({ id: p.id, title: p.title })) },
      });
    }

    const priceEdits: { id: number; title: string; variant: string; from: string; to: string }[] = [];
    for (const p of next.products) {
      const old = p0.get(p.id);
      if (!old) continue;
      for (const [variant, price] of Object.entries(p.prices)) {
        const was = old.prices[variant];
        if (was !== undefined && was !== price) priceEdits.push({ id: p.id, title: p.title, variant, from: was, to: price });
      }
    }
    if (priceEdits.length) {
      const productCount = new Set(priceEdits.map((e) => e.id)).size;
      const suspicious = priceEdits.filter((e) => {
        const to = Number(e.to);
        const from = Number(e.from);
        return to <= 0 || (from > 0 && (to / from < 0.3 || to / from > 3));
      });
      const bulk = productCount >= BULK_THRESHOLD;
      changes.push({
        kind: 'prices_changed',
        summary: `Prices changed on ${plural(productCount, 'product')}`,
        risky: suspicious.length > 0 || bulk,
        details: {
          bulk,
          edits: priceEdits.slice(0, 200),
          suspicious,
          note: suspicious.length
            ? `${plural(suspicious.length, 'price')} at zero or moved more than 3x`
            : 'no zero or extreme prices found',
        },
      });
    }
  }

  return changes;
}
