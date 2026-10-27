// Health score 0–100. Weights live here so they can be tuned with the first agencies.

import type { Db } from './db.ts';

export const WEIGHTS = { checkout: 35, uptime: 25, speed: 20, riskyChanges: 10, upkeep: 10 };

export type HealthInputs = {
  /** Share of checkout runs in the last 7 days that passed; null when no test runs. */
  checkoutPassRate: number | null;
  /** Uptime over 30 days, 0–1. */
  uptime: number | null;
  /** Latest mobile performance score 0–100. */
  speedScore: number | null;
  /** Risky changes in the last 7 days with no matching work-log entry. */
  unexplainedRiskyChanges: number;
  /** Apps loading scripts with no named owner (unknown hosts), a rough upkeep signal. */
  unknownScriptHosts: number;
};

export function healthScore(h: HealthInputs): number {
  // Missing signals are scored on the ones we have, so a store without a checkout test is not penalised.
  const parts: [number, number][] = [];
  if (h.checkoutPassRate !== null) parts.push([WEIGHTS.checkout, h.checkoutPassRate]);
  if (h.uptime !== null) {
    // 99.9% and up is full marks; 99% or less is zero.
    parts.push([WEIGHTS.uptime, Math.max(0, Math.min(1, (h.uptime - 0.99) / 0.009))]);
  }
  if (h.speedScore !== null) parts.push([WEIGHTS.speed, h.speedScore / 100]);
  parts.push([WEIGHTS.riskyChanges, Math.max(0, 1 - h.unexplainedRiskyChanges / 3)]);
  parts.push([WEIGHTS.upkeep, Math.max(0, 1 - h.unknownScriptHosts / 10)]);
  const total = parts.reduce((s, [w]) => s + w, 0);
  return Math.round((parts.reduce((s, [w, v]) => s + w * v, 0) / total) * 100);
}

export async function recomputeHealth(db: Db, storeId: string): Promise<number> {
  const { rows } = await db.query<{
    checkout: number | null;
    uptime: number | null;
    speed: number | null;
    risky: number;
    unknown: number;
  }>(
    `select
       (select avg((result = 'pass')::int)::float from public.checkout_runs
         where store_id = $1 and ran_at > now() - interval '7 days' and result <> 'blocked') as checkout,
       (select avg(ok::int)::float from public.uptime_checks
         where store_id = $1 and checked_at > now() - interval '30 days') as uptime,
       (select performance_score from public.speed_samples
         where store_id = $1 and page = 'home' order by sampled_at desc limit 1) as speed,
       (select count(*)::int from public.changes
         where store_id = $1 and risky and work_entry_id is null and occurred_at > now() - interval '7 days') as risky,
       (select count(*)::int from public.storefront_snapshots s, jsonb_array_elements(s.apps) a
         where s.id = (select id from public.storefront_snapshots where store_id = $1 order by taken_at desc limit 1)
           and a->>'key' like 'host-%') as unknown`,
    [storeId],
  );
  const r = rows[0];
  const score = healthScore({
    checkoutPassRate: r.checkout,
    uptime: r.uptime,
    speedScore: r.speed,
    unexplainedRiskyChanges: r.risky,
    unknownScriptHosts: r.unknown,
  });
  await db.query(`update public.stores set health_score = $2 where id = $1`, [storeId, score]);
  return score;
}
