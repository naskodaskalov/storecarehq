'use client';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestHealthCheck } from '@/app/(app)/stores/[id]/health-check-actions';

export type HealthCheck = {
  id: string; source: string; status: string; requested_at: string; started_at: string | null;
  finished_at: string | null; phase: string | null;
  results: Record<string, { status: string; message?: string }>;
};
const phases = [['uptime','Uptime'],['storefront','Theme, apps & products'],['speed','Mobile speed'],['site','SSL, domain & links'],['checkout','Checkout']];
const titles: Record<string,string> = { queued: 'Health check queued', running: 'Checking your store…', completed: 'Health check finished', partial: 'Finished with some results unavailable', failed: 'Health check could not finish' };
const initialAction = { error: null, requestId: null };

export function HealthCheckStatus({ storeId, initial, initialTime, paused, unavailable = false }: { storeId: string; initial: HealthCheck | null; initialTime: number; paused: boolean; unavailable?: boolean }) {
  const router = useRouter();
  const [scan,setScan] = useState(initial);
  const [action,formAction,pending] = useActionState(requestHealthCheck,initialAction);
  const [acknowledged,setAcknowledged] = useState<string | null>(null);
  const [pollError,setPollError] = useState('');
  const [now,setNow] = useState(initialTime);
  useEffect(() => { setScan(initial); },[initial]);
  const active = scan?.status === 'queued' || scan?.status === 'running';
  const newRequest = !!action.requestId && action.requestId !== acknowledged;
  const cooldown = scan ? Math.max(0,Date.parse(scan.requested_at)+300000-now) : 0;
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setNow(Date.now()),1000);
    return () => clearInterval(timer);
  },[!!cooldown]);
  useEffect(() => {
    if ((!active && !newRequest) || pollError && !newRequest) return;
    let cancelled = false;
    let loading = false;
    const poll = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch(`/api/stores/${storeId}/health-check`, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12000) });
        if (!response.ok) throw new Error();
        const data = await response.json() as { scan: HealthCheck | null };
        if (cancelled) return;
        setScan(data.scan); setPollError(''); setAcknowledged(action.requestId); setNow(Date.now());
        if (data.scan && !['queued','running'].includes(data.scan.status)) router.refresh();
      } catch {
        if (!cancelled) { setPollError('Progress could not be refreshed. Reload this page to check again; your request is saved.'); setAcknowledged(action.requestId); }
      } finally { loading = false; }
    };
    void poll();
    const timer = setInterval(() => void poll(),5000);
    return () => { cancelled = true; clearInterval(timer); };
  },[storeId,active,newRequest,pollError,action.requestId,router]);
  const status = newRequest ? 'queued' : scan?.status;
  return <section className="card health-scan" aria-label="Health check">
    <div className="row health-scan-heading"><div><span className="small muted">STORE MONITORING</span><h2 role="status" aria-live="polite">{status ? titles[status] ?? 'Health check' : 'Run a fresh health check'}</h2></div>
      <form action={formAction}><input type="hidden" name="store" value={storeId} /><button className="btn" disabled={paused || unavailable || active || newRequest || pending || cooldown>0}>{pending ? 'Queueing…' : active || newRequest ? 'Check in progress' : 'Run health check'}</button></form></div>
    {action.error && <p className="error" role="alert">{action.error}</p>}
    {(pollError || unavailable) && <p className="error" role="alert">{pollError || 'Health check status could not be loaded. Reload the page before requesting a check.'}</p>}
    <p className="small muted" style={{ margin: 0 }}>{paused ? 'Monitoring is paused. Resume it in settings to run a check.'
      : status === 'queued' ? scan && now-Date.parse(scan.requested_at)>300000
        ? 'The worker is taking longer than usual. Your request is saved and will be retried automatically; you do not need to queue it again.'
        : 'Your request is saved. Checks start when a worker is available; this can take a few minutes.'
      : status === 'running' ? 'Results update as each check finishes. You can leave this page and return later.'
      : scan?.finished_at ? `Last scan update: ${new Date(scan.finished_at).toLocaleString('en-GB',{timeZone:'UTC'})} UTC. Review the results below; unavailable checks keep their previous metrics.`
      : 'Refresh uptime, storefront, speed and site checks. Checkout runs only if you have enabled it. Scheduled monitoring continues automatically.'}</p>
    {scan && !newRequest && <ul className="health-scan-phases">{phases.map(([key,label]) => {
      const result = scan.results[key];
      const text = result?.status === 'completed' ? 'Finished' : result?.status === 'failed' ? 'Unavailable' : result?.status === 'skipped' ? 'Skipped' : scan.phase === key && active ? 'Checking…' : active ? 'Waiting' : 'Not completed';
      return <li key={key}><span>{label}</span><strong className={result?.status === 'failed' ? 'warn' : 'muted'}>{text}</strong>{result?.message && <p className="small muted">{result.message}</p>}</li>;
    })}</ul>}
    {scan?.results.summary?.message && <p className="notice">{scan.results.summary.message}</p>}
    {scan?.source === 'initial' && <p className="small muted" style={{ margin: 0 }}>The first storefront snapshot establishes a baseline. Changes appear after a later snapshot.</p>}
    {!active && !newRequest && cooldown>0 && <p className="small muted" style={{ margin: 0 }}>You can request another check in {Math.ceil(cooldown/60000)} min.</p>}
  </section>;
}
