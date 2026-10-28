// Loads one store's month for a report, as the signed-in user (RLS applies).
// The worker loads the same rows with SQL (apps/worker/src/jobs/report.ts); both use assembleMonthData.

import { assembleMonthData, periodRange, previousPeriod, type MonthData, type MonthRows, type Period } from '@storecare/reports';
import type { supabaseServer } from './supabase';

type Client = Awaited<ReturnType<typeof supabaseServer>>;

export async function loadMonthData(supabase: Client, storeId: string, period: Period): Promise<MonthData | null> {
  const { from, to } = periodRange(period);
  const prev = previousPeriod(period);

  const { data: store } = await supabase
    .from('stores')
    .select('id, agency_id, name, public_url, health_score, status, limited_reason, created_at')
    .eq('id', storeId)
    .single();
  if (!store) return null;

  const [agency, plan, upStats, incidents, runs, speed, changes, work, prevWork, snap, stockSnap, quality, site] = await Promise.all([
    supabase.from('agencies').select('name, brand_color').eq('id', store.agency_id).single(),
    supabase.from('care_plans').select('name, hours_included, rollover_rule').eq('store_id', storeId).single(),
    supabase.rpc('uptime_stats', { p_store: storeId, p_from: from, p_to: to }),
    supabase.from('incidents').select('kind, opened_at, resolved_at, cause, client_note').eq('store_id', storeId).gte('opened_at', from).lt('opened_at', to).order('opened_at'),
    supabase.from('checkout_runs').select('ran_at, result').eq('store_id', storeId).gte('ran_at', from).lt('ran_at', to).order('ran_at').limit(200),
    supabase.from('speed_samples').select('sampled_at, performance_score, lcp_ms').eq('store_id', storeId).eq('page', 'home').gte('sampled_at', from).lt('sampled_at', to).order('sampled_at').limit(100),
    supabase.from('changes').select('occurred_at, kind, summary, risky, work_entry_id').eq('store_id', storeId).gte('occurred_at', from).lt('occurred_at', to).order('occurred_at').limit(500),
    supabase.from('work_entries').select('id, work_date, minutes, title, client_text, counts_to_plan').eq('store_id', storeId).gte('work_date', period.start).lt('work_date', period.end).order('work_date').limit(500),
    supabase.from('work_entries').select('minutes').eq('store_id', storeId).eq('counts_to_plan', true).gte('work_date', prev.start).lt('work_date', prev.end).limit(1000),
    supabase.from('storefront_snapshots').select('apps').eq('store_id', storeId).order('taken_at', { ascending: false }).limit(1),
    supabase.from('storefront_snapshots').select('products').eq('store_id', storeId).not('products', 'is', null).lt('taken_at', to).order('taken_at', { ascending: false }).limit(1),
    supabase.from('speed_samples').select('field_lcp_ms, field_inp_ms, field_category, seo_score, accessibility_score').eq('store_id', storeId).eq('page', 'home').gte('sampled_at', from).lt('sampled_at', to).order('sampled_at', { ascending: false }).limit(1),
    supabase.from('site_checks').select('ssl_expires_at, domain_expires_at, domain, pages_checked, broken').eq('store_id', storeId).gte('checked_at', from).lt('checked_at', to).order('checked_at', { ascending: false }).limit(1),
  ]);

  const rows: MonthRows = {
    store,
    agency: agency.data,
    plan: plan.data,
    uptime: (upStats.data as MonthRows['uptime'][] | null)?.[0] ?? null,
    incidents: incidents.data ?? [],
    checkoutRuns: (runs.data ?? []) as MonthRows['checkoutRuns'],
    speed: speed.data ?? [],
    changes: changes.data ?? [],
    work: work.data ?? [],
    previousWork: prevWork.data ?? [],
    apps: (snap.data?.[0]?.apps ?? null) as MonthRows['apps'],
    products: (stockSnap.data?.[0]?.products ?? null) as MonthRows['products'],
    quality: quality.data?.[0] ?? null,
    site: (site.data?.[0] ?? null) as MonthRows['site'],
  };
  return assembleMonthData(period, rows);
}
