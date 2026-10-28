// Monthly: draft last month's report for a store, from the same facts the web app uses.
// Only creates a draft when none exists for that month; never touches one the agency has started.

import {
  assembleMonthData,
  buildFacts,
  DEFAULT_SECTIONS,
  periodRange,
  previousPeriod,
  writeSummary,
  type MonthRows,
  type Period,
} from '@storecare/reports';
import type { Db } from '../db.ts';

/** All of one store's month in one round trip, shaped like the Supabase rows the web loader gets. */
const MONTH_SQL = `
with s as (select * from public.stores where id = $1)
select jsonb_build_object(
  'store', (select to_jsonb(x) from (select name, public_url, health_score, status, limited_reason, created_at from s) x),
  'agency', (select to_jsonb(x) from (select a.name, a.brand_color from public.agencies a join s on s.agency_id = a.id) x),
  'plan', (select to_jsonb(x) from (select name, hours_included, rollover_rule from public.care_plans where store_id = $1 limit 1) x),
  'uptime', (select to_jsonb(x) from public.uptime_stats($1, $2, $3) x),
  'incidents', coalesce((select jsonb_agg(to_jsonb(x) order by x.opened_at) from (
     select kind, opened_at, resolved_at, cause, client_note from public.incidents
      where store_id = $1 and opened_at >= $2 and opened_at < $3) x), '[]'),
  'checkoutRuns', coalesce((select jsonb_agg(to_jsonb(x) order by x.ran_at) from (
     select ran_at, result from public.checkout_runs
      where store_id = $1 and ran_at >= $2 and ran_at < $3 order by ran_at limit 200) x), '[]'),
  'speed', coalesce((select jsonb_agg(to_jsonb(x) order by x.sampled_at) from (
     select sampled_at, performance_score, lcp_ms from public.speed_samples
      where store_id = $1 and page = 'home' and sampled_at >= $2 and sampled_at < $3 order by sampled_at limit 100) x), '[]'),
  'changes', coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at) from (
     select occurred_at, kind, summary, risky, work_entry_id from public.changes
      where store_id = $1 and occurred_at >= $2 and occurred_at < $3 order by occurred_at limit 500) x), '[]'),
  'work', coalesce((select jsonb_agg(to_jsonb(x) order by x.work_date) from (
     select id, work_date, minutes, title, client_text, counts_to_plan from public.work_entries
      where store_id = $1 and work_date >= $4::date and work_date < $5::date order by work_date limit 500) x), '[]'),
  'previousWork', coalesce((select jsonb_agg(to_jsonb(x)) from (
     select minutes from public.work_entries
      where store_id = $1 and counts_to_plan and work_date >= $6::date and work_date < $4::date limit 1000) x), '[]'),
  'apps', (select apps from public.storefront_snapshots where store_id = $1 order by taken_at desc limit 1),
  'products', (select products from public.storefront_snapshots
      where store_id = $1 and products is not null and taken_at < $3 order by taken_at desc limit 1),
  'quality', (select to_jsonb(x) from (
     select field_lcp_ms, field_inp_ms, field_category, seo_score, accessibility_score from public.speed_samples
      where store_id = $1 and page = 'home' and sampled_at >= $2 and sampled_at < $3 order by sampled_at desc limit 1) x),
  'site', (select to_jsonb(x) from (
     select ssl_expires_at, domain_expires_at, domain, pages_checked, broken from public.site_checks
      where store_id = $1 and checked_at >= $2 and checked_at < $3 order by checked_at desc limit 1) x)
) as rows
from s`;

export async function loadMonthRows(db: Db, storeId: string, period: Period): Promise<MonthRows | null> {
  const { from, to } = periodRange(period);
  const prev = previousPeriod(period);
  const { rows } = await db.query<{ rows: MonthRows }>(MONTH_SQL, [storeId, from, to, period.start, period.end, prev.start]);
  return rows[0]?.rows ?? null;
}

export type DraftResult =
  | { created: true; reportId: string; period: Period; summarySource: 'ai' | 'template' }
  | { created: false; reason: 'exists' | 'store missing' | 'store too new' };

export async function draftMonthlyReport(
  db: Db,
  storeId: string,
  period: Period,
  opts: { apiKey?: string; now?: Date } = {},
): Promise<DraftResult> {
  const { rows: existing } = await db.query(`select 1 from public.reports where store_id = $1 and period = $2`, [storeId, period.start]);
  if (existing.length) return { created: false, reason: 'exists' };
  const raw = await loadMonthRows(db, storeId, period);
  if (!raw?.store) return { created: false, reason: 'store missing' };
  // A store added after the month ended has nothing to report for it.
  if (Date.parse(raw.store.created_at) >= Date.parse(periodRange(period).to)) return { created: false, reason: 'store too new' };

  const facts = buildFacts(assembleMonthData(period, raw, opts.now));
  const summary = await writeSummary(facts, { apiKey: opts.apiKey });
  if (summary.error) console.warn(`[report] AI summary failed for ${facts.storeName}, used template: ${summary.error}`);

  const { rows } = await db.query<{ id: string }>(
    `insert into public.reports (store_id, agency_id, period, status, sections, facts, summary_text, summary_source, auto_drafted_at)
     select id, agency_id, $2, 'draft', $3, $4, $5, $6, now() from public.stores where id = $1
     on conflict (store_id, period) do nothing
     returning id`,
    [storeId, period.start, JSON.stringify(DEFAULT_SECTIONS), JSON.stringify(facts), summary.text, summary.source],
  );
  if (!rows[0]) return { created: false, reason: 'exists' }; // drafted by hand a moment ago
  return { created: true, reportId: rows[0].id, period, summarySource: summary.source };
}
