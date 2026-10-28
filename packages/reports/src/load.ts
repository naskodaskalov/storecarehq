// Raw rows for one store's month → MonthData. Both loaders (web app via Supabase, worker via pg)
// fetch the same rows and call this, so a report drafted automatically matches one drafted by hand.

import { previousPeriod } from './period.ts';
import type { MonthData, Period } from './types.ts';

type ProductRow = { prices: Record<string, unknown>; soldOut?: string[] };

export type MonthRows = {
  store: { name: string; public_url: string; health_score: number | null; status: string; limited_reason: string | null; created_at: string };
  agency: { name: string; brand_color: string } | null;
  plan: { name: string; hours_included: number | string; rollover_rule: string } | null;
  uptime: { checks: number | string; ok: number | string; avg_ms: number | string | null } | null;
  incidents: MonthData['incidents'];
  checkoutRuns: MonthData['checkoutRuns'];
  speed: MonthData['speed'];
  changes: MonthData['changes'];
  work: MonthData['work'];
  previousWork: { minutes: number }[];
  apps: MonthData['apps'] | null; // latest snapshot
  products: ProductRow[] | null; // latest snapshot with a product feed, before the month ended
  quality: { field_lcp_ms: number | null; field_inp_ms: number | null; field_category: string | null; seo_score: number | null; accessibility_score: number | null } | null;
  site: { ssl_expires_at: string | null; domain_expires_at: string | null; domain: string | null; pages_checked: number; broken: { url: string; status: number }[] | null } | null;
};

/** Every variant of the product is sold out. */
export function productSoldOut(p: ProductRow): boolean {
  if (!p.soldOut) return false;
  const variants = Object.keys(p.prices ?? {}).length;
  return variants > 0 && p.soldOut.length >= variants;
}

/** The [from, to) timestamps a month covers. */
export function periodRange(period: Period) {
  return { from: `${period.start}T00:00:00Z`, to: `${period.end}T00:00:00Z` };
}

export function assembleMonthData(period: Period, r: MonthRows, now = new Date()): MonthData {
  const prev = previousPeriod(period);
  const { to } = periodRange(period);
  const avg = r.uptime?.avg_ms;
  return {
    period,
    store: {
      name: r.store.name,
      public_url: r.store.public_url,
      health_score: r.store.health_score,
      status: r.store.status,
      limited_reason: r.store.limited_reason,
    },
    agency: r.agency ?? { name: 'Your agency', brand_color: '#2747A8' },
    plan: r.plan ? { ...r.plan, hours_included: Number(r.plan.hours_included) } : null,
    uptime: { checks: Number(r.uptime?.checks ?? 0), ok: Number(r.uptime?.ok ?? 0), avgMs: avg === null || avg === undefined ? null : Number(avg) },
    incidents: r.incidents,
    checkoutRuns: r.checkoutRuns,
    speed: r.speed,
    changes: r.changes,
    work: r.work,
    apps: r.apps ?? [],
    // Rollover only applies if the store was on a plan for all of last month.
    previousMonthMinutes:
      new Date(r.store.created_at).getTime() <= Date.parse(`${prev.start}T23:59:59Z`)
        ? r.previousWork.reduce((a, w) => a + w.minutes, 0)
        : null,
    // Stock only counts once availability is being recorded (snapshots from before that have no soldOut).
    stock: r.products && r.products.some((p) => p.soldOut) ? { products: r.products.length, outOfStock: r.products.filter(productSoldOut).length } : null,
    quality: r.quality
      ? {
          fieldLcpMs: r.quality.field_lcp_ms,
          fieldInpMs: r.quality.field_inp_ms,
          fieldCategory: r.quality.field_category,
          seo: r.quality.seo_score,
          accessibility: r.quality.accessibility_score,
        }
      : null,
    site: r.site
      ? {
          sslExpiresAt: r.site.ssl_expires_at,
          domainExpiresAt: r.site.domain_expires_at,
          domain: r.site.domain,
          pagesChecked: r.site.pages_checked,
          broken: r.site.broken ?? [],
        }
      : null,
    asOf: new Date(Math.min(now.getTime(), Date.parse(to))).toISOString(),
  };
}
