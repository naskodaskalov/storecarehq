// Loads one store's month for a report, as the signed-in user (RLS applies).

import { previousPeriod, type MonthData, type Period } from '@storecare/reports';
import type { supabaseServer } from './supabase';

type Client = Awaited<ReturnType<typeof supabaseServer>>;

export async function loadMonthData(supabase: Client, storeId: string, period: Period): Promise<MonthData | null> {
  const from = `${period.start}T00:00:00Z`;
  const to = `${period.end}T00:00:00Z`;
  const prev = previousPeriod(period);

  const { data: store } = await supabase
    .from('stores')
    .select('id, agency_id, name, public_url, health_score, status, limited_reason, created_at')
    .eq('id', storeId)
    .single();
  if (!store) return null;

  const [agency, plan, upAll, upOk, incidents, runs, speed, changes, work, prevWork, snap] = await Promise.all([
    supabase.from('agencies').select('name, brand_color').eq('id', store.agency_id).single(),
    supabase.from('care_plans').select('name, hours_included, rollover_rule').eq('store_id', storeId).single(),
    supabase.from('uptime_checks').select('ok', { count: 'exact', head: true }).eq('store_id', storeId).gte('checked_at', from).lt('checked_at', to),
    supabase.from('uptime_checks').select('ok', { count: 'exact', head: true }).eq('store_id', storeId).eq('ok', true).gte('checked_at', from).lt('checked_at', to),
    supabase.from('incidents').select('kind, opened_at, resolved_at, cause, client_note').eq('store_id', storeId).gte('opened_at', from).lt('opened_at', to).order('opened_at'),
    supabase.from('checkout_runs').select('ran_at, result').eq('store_id', storeId).gte('ran_at', from).lt('ran_at', to).order('ran_at').limit(200),
    supabase.from('speed_samples').select('sampled_at, performance_score, lcp_ms').eq('store_id', storeId).eq('page', 'home').gte('sampled_at', from).lt('sampled_at', to).order('sampled_at').limit(100),
    supabase.from('changes').select('occurred_at, kind, summary, risky, work_entry_id').eq('store_id', storeId).gte('occurred_at', from).lt('occurred_at', to).order('occurred_at').limit(500),
    supabase.from('work_entries').select('id, work_date, minutes, title, client_text, counts_to_plan').eq('store_id', storeId).gte('work_date', period.start).lt('work_date', period.end).order('work_date').limit(500),
    supabase.from('work_entries').select('minutes').eq('store_id', storeId).eq('counts_to_plan', true).gte('work_date', prev.start).lt('work_date', prev.end).limit(1000),
    supabase.from('storefront_snapshots').select('apps').eq('store_id', storeId).order('taken_at', { ascending: false }).limit(1),
  ]);

  return {
    period,
    store: {
      name: store.name,
      public_url: store.public_url,
      health_score: store.health_score,
      status: store.status,
      limited_reason: store.limited_reason,
    },
    agency: agency.data ?? { name: 'Your agency', brand_color: '#2747A8' },
    plan: plan.data ? { ...plan.data, hours_included: Number(plan.data.hours_included) } : null,
    uptime: { checks: upAll.count ?? 0, ok: upOk.count ?? 0 },
    incidents: incidents.data ?? [],
    checkoutRuns: (runs.data ?? []) as MonthData['checkoutRuns'],
    speed: speed.data ?? [],
    changes: changes.data ?? [],
    work: work.data ?? [],
    apps: (snap.data?.[0]?.apps ?? []) as MonthData['apps'],
    // Rollover only applies if the store was on a plan for all of last month.
    previousMonthMinutes:
      String(store.created_at) <= `${prev.start}T23:59:59Z`
        ? (prevWork.data ?? []).reduce((a: number, w: { minutes: number }) => a + w.minutes, 0)
        : null,
  };
}
