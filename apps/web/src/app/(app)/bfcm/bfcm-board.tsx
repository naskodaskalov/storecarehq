'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import type { AuditRun } from '@/lib/bfcm-run';

export type BoardAudit = { id: string; created_at: string; verdict: 'fix' | 'look' | 'ready' | 'partial'; fixes: number; looks: number; shared_at: string | null; sent_at: string | null };
export type BoardStore = { id: string; name: string; host: string; paused: boolean; limited: boolean; audit: BoardAudit | null };
type Row = { state: 'queued' | 'running' } | { state: 'failed'; error: string };

/** Stores are different hosts, so a few can be checked at once without being impolite to any of them. */
const AT_ONCE = 3;

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function Result({ a }: { a: BoardAudit }) {
  const [tone, label] = a.verdict === 'fix' ? ['danger', `${a.fixes} to fix`] : a.verdict === 'partial' ? ['neutral', 'Not fully checked'] : a.verdict === 'look' ? ['warning', `Ready · ${a.looks} to look at`] : ['success', 'Ready'];
  return <span className={`status-badge ${tone}`}><strong>{label}</strong></span>;
}

export function BfcmBoard({ stores, autoStart }: { stores: BoardStore[]; autoStart: boolean }) {
  const router = useRouter();
  const [audits, setAudits] = useState<Record<string, BoardAudit | null>>(() => Object.fromEntries(stores.map((s) => [s.id, s.audit])));
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const started = useRef(false);
  const runnable = stores.filter((s) => !s.paused);

  // Fresh server data after a run (shared and sent states included) replaces what the run reported.
  useEffect(() => setAudits(Object.fromEntries(stores.map((s) => [s.id, s.audit]))), [stores]);

  async function run(ids: string[]) {
    if (!ids.length || progress) return;
    setProgress({ done: 0, total: ids.length });
    setRows((r) => ({ ...r, ...Object.fromEntries(ids.map((id) => [id, { state: 'queued' } as Row])) }));
    const queue = [...ids];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const storeId = id;
        setRows((r) => ({ ...r, [storeId]: { state: 'running' } }));
        let result: AuditRun;
        try {
          const res = await fetch(`/api/bfcm/${storeId}`, { method: 'POST', headers: { accept: 'application/json' } });
          result = res.headers.get('content-type')?.includes('json') ? await res.json() : { ok: false, error: res.status === 401 ? 'Sign in again to continue.' : 'The check did not finish. Try again.' };
        } catch {
          result = { ok: false, error: 'The check did not finish. Check your connection and try again.' };
        }
        if (result.ok) {
          const r = result;
          setAudits((a) => ({ ...a, [storeId]: { id: r.id, created_at: r.checkedAt, verdict: r.verdict, fixes: r.fixes, looks: r.looks, shared_at: null, sent_at: null } }));
          setRows((all) => { const next = { ...all }; delete next[storeId]; return next; });
        } else {
          const error = result.error;
          setRows((all) => ({ ...all, [storeId]: { state: 'failed', error } }));
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
    };
    await Promise.all(Array.from({ length: Math.min(AT_ONCE, ids.length) }, worker));
    setProgress(null);
    router.refresh();
  }

  // "Check all stores" on the Overview links here with ?run=all: start once, then drop the parameter so a reload doesn't re-run.
  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    router.replace('/bfcm', { scroll: false });
    void run(runnable.map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const latest = stores.map((s) => audits[s.id]).filter(Boolean) as BoardAudit[];
  const counts = { fix: latest.filter((a) => a.verdict === 'fix').length, look: latest.filter((a) => a.verdict === 'look').length, ready: latest.filter((a) => a.verdict === 'ready').length, partial: latest.filter((a) => a.verdict === 'partial').length };
  const failed = Object.entries(rows).filter(([, r]) => r.state === 'failed').map(([id]) => id);
  const busy = !!progress;

  return (
    <>
      <section className="workspace-section" aria-labelledby="bfcm-run-title">
        <div className="bfcm-run">
          <div>
            <h2 id="bfcm-run-title">Check every store</h2>
            <p className="small muted" style={{ margin: '6px 0 0' }}>A live visit to each store plus its latest monitoring. About two seconds per store; nothing changes on the stores.</p>
          </div>
          <div className="bfcm-run-actions">
            {failed.length > 0 && !busy && <button type="button" className="btn secondary" onClick={() => run(failed)}>Retry {failed.length} failed</button>}
            <button type="button" className="btn" disabled={busy || !runnable.length} onClick={() => run(runnable.map((s) => s.id))} aria-describedby="bfcm-run-status">
              {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="tag" size={16} />}
              {busy ? `Checking ${progress.done} of ${progress.total}…` : `Check all ${runnable.length} store${runnable.length === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
        {busy && <div className="bfcm-progress" role="progressbar" aria-label="Stores checked" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}><span style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>}
        <div className="bfcm-run-summary" id="bfcm-run-status" role="status" aria-live="polite">
          {busy ? <span>Checking {progress.total} store{progress.total === 1 ? '' : 's'}, {AT_ONCE} at a time. You can leave this page open in a tab.</span>
            : latest.length ? <><span><strong>{counts.fix}</strong> need fixes</span><span><strong>{counts.look}</strong> ready with notes</span><span><strong>{counts.ready}</strong> ready</span>{counts.partial > 0 && <span><strong>{counts.partial}</strong> not fully checked</span>}{latest.length < runnable.length && <span><strong>{runnable.length - latest.length}</strong> not checked yet</span>}</>
            : <span>No store checked yet.</span>}
        </div>
      </section>

      <section className="workspace-section workspace-table-section" aria-label="Stores">
        <div className="table-wrap">
          <table className="bfcm-table">
            <thead><tr><th>Store</th><th>Result</th><th>Checked</th><th>Client</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {stores.map((s) => {
                const a = audits[s.id];
                const row = rows[s.id];
                return (
                  <tr key={s.id} aria-busy={row?.state === 'running'}>
                    <td><div style={{ fontWeight: 600 }}>{s.name}</div><div className="small muted">{s.host}{s.limited ? ' · limited monitoring' : ''}</div></td>
                    <td>
                      {row?.state === 'running' ? <span className="bfcm-row-state"><span className="spinner" aria-hidden="true" />Checking…</span>
                        : row?.state === 'queued' ? <span className="bfcm-row-state"><Icon name="clock" size={14} />Waiting</span>
                        : row?.state === 'failed' ? <span className="bfcm-row-error" role="alert">{row.error}</span>
                        : s.paused ? <span className="muted small">Paused, skipped</span>
                        : a ? <Result a={a} /> : <span className="muted small">Not checked yet</span>}
                    </td>
                    <td className="small muted">{a ? when(a.created_at) : '—'}</td>
                    <td className="small">{a?.sent_at ? <span>Sent {when(a.sent_at)}</span> : a?.shared_at ? <span>Link on</span> : <span className="muted">Not shared</span>}</td>
                    <td>
                      <div className="bfcm-row-actions">
                        {a && <Link className="btn secondary" href={`/bfcm/${a.id}`}><Icon name="report" size={15} />One-pager</Link>}
                        {!s.paused && <button type="button" className="btn secondary" disabled={busy} onClick={() => run([s.id])} aria-label={`Check ${s.name} again`}>{a ? 'Re-check' : 'Check'}</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/** "Check again" on a one-pager: runs the store now and opens the new one-pager. */
export function RecheckButton({ storeId }: { storeId: string }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button type="button" className="btn secondary" style={{ alignSelf: 'flex-start' }} disabled={state.busy} onClick={async () => {
        setState({ busy: true });
        try {
          const res = await fetch(`/api/bfcm/${storeId}`, { method: 'POST', headers: { accept: 'application/json' } });
          const body = (res.headers.get('content-type')?.includes('json') ? await res.json() : { ok: false, error: 'The check did not finish. Try again.' }) as AuditRun;
          if (body.ok) router.push(`/bfcm/${body.id}`);
          else setState({ busy: false, error: body.error });
        } catch {
          setState({ busy: false, error: 'The check did not finish. Check your connection and try again.' });
        }
      }}>
        {state.busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="tag" size={15} />}{state.busy ? 'Checking the store…' : 'Check again now'}
      </button>
      {state.error && <span className="bfcm-row-error" role="alert">{state.error}</span>}
    </div>
  );
}
