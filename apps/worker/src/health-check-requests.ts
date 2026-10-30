import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { getStore, type Db } from './db.ts';
import { withStoreLock } from './store-lock.ts';
import { testHandle } from './jobs/checkout.ts';
import { recomputeHealth } from './health.ts';
import { uptimeTask, storefrontTask, speedTask, siteTask, checkoutTask } from './tasks.ts';

export const SCAN_PHASES = ['uptime','storefront','speed','site','checkout'] as const;
type Phase = typeof SCAN_PHASES[number];
type PhaseResult = { status: 'completed' | 'failed' | 'skipped'; message?: string };
type Results = Partial<Record<Phase, PhaseResult>> & { summary?: PhaseResult };
type Scan = { id: string; store_id: string; results: Results; lease_token: string };
const tasks: Record<Phase, (db: Db, id: string) => Promise<void>> = {
  uptime: uptimeTask, storefront: (db,id) => storefrontTask(db,id,{forceProducts:true,requireFresh:true}),
  speed: speedTask, site: siteTask, checkout: checkoutTask,
};

export function scanOutcome(results: Results): 'completed' | 'partial' | 'failed' {
  const values = SCAN_PHASES.map(p => results[p]);
  const failures = values.filter(r => !r || r.status === 'failed').length;
  return failures ? (values.some(r => r?.status === 'completed') ? 'partial' : 'failed') : 'completed';
}

async function eligible(db: Db, id: string) {
  const { rows } = await db.query('select s.id from public.stores s join public.agencies a on a.id=s.agency_id where s.id=$1 and s.status<>\'paused\' and public.agency_has_access(a)',[id]);
  return !!rows.length;
}

export async function executeScan(db: Db, scan: Scan, run = tasks) {
  const results: Results = { ...scan.results };
  const save = async (phase: Phase | null, status: string = 'running') => {
    const r = await db.query(`update public.health_check_requests set phase=$3,status=$4,results=$5::jsonb,
      lease_until=case when $4='running' then now()+interval '15 minutes' else null end,
      finished_at=case when $4='running' then null else now() end
      where id=$1 and lease_token=$2 and status='running' returning id`,[scan.id,scan.lease_token,phase,status,JSON.stringify(results)]);
    if (!r.rowCount) throw new Error('Scan lease no longer owned');
  };
  for (const phase of SCAN_PHASES) {
    if (results[phase]?.status === 'completed' || results[phase]?.status === 'skipped') continue;
    if (!await eligible(db,scan.store_id)) {
      results.summary = { status: 'failed', message: 'Monitoring paused or plan access ended. Resume monitoring before trying again.' };
      await save(null,'failed'); return;
    }
    await save(phase);
    try {
      if (phase === 'checkout') {
        const store = await getStore(db,scan.store_id);
        const reason = !store?.checkout_consent_at ? 'Checkout consent is not enabled.'
          : !store.checkout_mobile && !store.checkout_desktop ? 'No checkout device is selected.'
          : !await testHandle(db,store) ? 'No product is available for a checkout test yet.' : null;
        if (reason) { results[phase] = { status: 'skipped', message: reason }; await save(phase); continue; }
      }
      await run[phase](db,scan.store_id);
      results[phase] = { status: 'completed' };
    } catch {
      results[phase] = { status: 'failed', message: phase === 'speed'
        ? 'Speed results unavailable. The provider may be busy; try another check later.'
        : 'This check could not finish. Other checks will continue.' };
    }
    await save(phase);
  }
  await recomputeHealth(db,scan.store_id);
  await save(null,scanOutcome(results));
}

/** Tables may not exist yet during the worker-first rollout. No dry-run caller invokes this. */
export async function processHealthCheckRequests(pool: pg.Pool, limit = 4, execute = executeScan) {
  if (!(await pool.query("select to_regclass('public.health_check_requests') as table_name")).rows[0].table_name) return;
  await pool.query(`update public.health_check_requests set status='failed',phase=null,finished_at=now(),lease_until=null,
    results=results || '{"summary":{"status":"failed","message":"The worker stopped before finishing. Please run a new health check."}}'::jsonb
    where status='running' and lease_until<now() and attempts>=2`);
  for (let i=0;i<limit;i++) {
    const token = randomUUID();
    const { rows } = await pool.query<Scan>(`with candidate as (
      select id from public.health_check_requests where attempts<2 and
        ((status='queued' and next_attempt_at<=now()) or (status='running' and lease_until<now()))
      order by requested_at for update skip locked limit 1
    ) update public.health_check_requests r set status='running',attempts=attempts+1,lease_token=$1,
      started_at=coalesce(started_at,now()),lease_until=now()+interval '15 minutes'
      from candidate where r.id=candidate.id returning r.id,r.store_id,r.results,r.lease_token`,[token]);
    const scan = rows[0];
    if (!scan) break;
    try {
      const locked = await withStoreLock(pool,scan.store_id,db => execute(db,scan));
      if (!locked.acquired) {
        await pool.query(`update public.health_check_requests set status='queued',phase=null,attempts=attempts-1,lease_token=null,
          lease_until=null,next_attempt_at=now()+interval '1 minute' where id=$1 and lease_token=$2 and status='running'`,[scan.id,token]);
      }
    } catch {
      // Keep the lease for recovery. Log no provider error, credentials, customer data or destinations.
      console.warn('Health check interrupted; its saved progress will be recovered after the lease expires.');
    }
  }
}
