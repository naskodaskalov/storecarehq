'use client';

import { useState, type FormEvent } from 'react';
import type { ScanReply, ScanSummary } from '@/lib/scan';
import { findings, parseStoreList, PORTFOLIO_MAX, type Finding } from '@/lib/scan-findings';
import { rememberStore } from './store-scan';

type Row = { host: string; state: 'queued' | 'checking' | 'done'; reply?: ScanReply };

const PARALLEL = 2;

async function scanOne(host: string): Promise<ScanReply> {
  try {
    const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: host }) });
    return (await res.json()) as ScanReply;
  } catch {
    return { ok: false, error: 'The check did not finish.' };
  }
}

/** Paste the client list, get the dashboard you'd have on day one: every store, checked, side by side. */
export function PortfolioCheck({ signup }: { signup: string }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [dropped, setDropped] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const busy = rows.some((r) => r.state !== 'done');
  const parsed = parseStoreList(text);

  async function run(e: FormEvent) {
    e.preventDefault();
    if (busy || !parsed.stores.length) return;
    setDropped(parsed.dropped);
    setOpen(null);
    const list = parsed.stores;
    setRows(list.map((host) => ({ host, state: 'queued' })));
    const update = (host: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.host === host ? { ...r, ...patch } : r)));
    let next = 0;
    const worker = async () => {
      while (next < list.length) {
        const host = list[next++];
        update(host, { state: 'checking' });
        update(host, { state: 'done', reply: await scanOne(host) });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
  }

  const done = rows.filter((r): r is Row & { reply: ScanSummary } => r.state === 'done' && !!r.reply?.ok);
  const looks = done.reduce((n, r) => n + findings(r.reply).filter((f) => f.tone === 'look').length, 0);
  const slow = done.filter((r) => r.reply.responseMs >= 2000).length;
  const finished = rows.length > 0 && !busy;

  return (
    <div className="lp-book">
      <form className="lp-book-form" onSubmit={run}>
        <label htmlFor="book-list">Your care clients’ stores, up to {PORTFOLIO_MAX}</label>
        <textarea id="book-list" rows={5} spellCheck={false} autoCapitalize="none" value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder={'ferrocoffee.co\njuniperandash.com\nkiteandkin.com'} />
        <div className="lp-book-form-foot">
          <span>{parsed.stores.length ? `${parsed.stores.length} store${parsed.stores.length > 1 ? 's' : ''}${parsed.dropped ? `, first ${PORTFOLIO_MAX} checked` : ''}` : 'One per line, or separated by commas'}</span>
          <button type="submit" className="btn" disabled={busy || !parsed.stores.length} aria-busy={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />Checking…</> : `Check ${parsed.stores.length > 1 ? `all ${parsed.stores.length}` : 'my stores'}`}
          </button>
        </div>
      </form>

      <div className="lp-board" aria-live="polite">
        <div className="lp-board-head">
          <span className="lp-board-title">{rows.length ? 'Your stores, right now' : 'Your dashboard, before you sign up'}</span>
          {finished && done.length > 0 && (
            <span className="lp-board-sum">
              {done.length} online · <b>{looks}</b> worth a look{slow ? ` · ${slow} slow` : ''}
            </span>
          )}
        </div>
        {rows.length === 0 ? (
          <ul className="lp-board-rows lp-board-ghost" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => <li key={i}><span className="g-dot" /><span className="g-a" /><span className="g-b" /><span className="g-c" /></li>)}
          </ul>
        ) : (
          <ul className="lp-board-rows">
            {rows.map((r) => <BoardRow key={r.host} row={r} open={open === r.host} onToggle={() => setOpen(open === r.host ? null : r.host)} />)}
          </ul>
        )}
        {dropped > 0 && finished && <p className="lp-board-note">{dropped} more in your list: the trial watches up to 50.</p>}
        {finished && done.length > 0 && (
          <div className="lp-board-cta">
            <p>This was one look at each. StoreCare HQ keeps this board current every 30 minutes and drafts each client’s report on the 1st.</p>
            <a href={signup} className="btn" onClick={() => rememberStore(done[0].reply.host)}>
              Watch {done.length > 1 ? `all ${done.length}` : done[0].reply.host} free for 7 days
            </a>
            <small>All {done.length} fit the Solo plan: $29/month after the trial.</small>
          </div>
        )}
      </div>
    </div>
  );
}

function BoardRow({ row, open, onToggle }: { row: Row; open: boolean; onToggle: () => void }) {
  if (row.state !== 'done' || !row.reply) {
    return (
      <li className="lp-board-row is-pending">
        <span className={`lp-st lp-st-${row.state}`} aria-hidden="true" />
        <span className="lp-bh">{row.host}</span>
        <span className="lp-bm">{row.state === 'checking' ? 'Checking…' : 'Queued'}</span>
      </li>
    );
  }
  const r = row.reply;
  if (!r.ok) {
    return (
      <li className="lp-board-row is-err">
        <span className="lp-st lp-st-err" aria-hidden="true" />
        <span className="lp-bh">{row.host}</span>
        <span className="lp-bm">{r.error}</span>
      </li>
    );
  }
  const list: Finding[] = findings(r);
  const n = list.filter((f) => f.tone === 'look').length;
  return (
    <li className={`lp-board-row${open ? ' is-open' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span className={`lp-st ${n ? 'lp-st-look' : 'lp-st-ok'}`} aria-hidden="true" />
        <span className="lp-bh">{r.host}</span>
        <span className="lp-bm"><span className="lp-mono">{(r.responseMs / 1000).toFixed(1)}s</span> · {r.appCount} apps{r.theme ? ` · ${r.theme.split(' · ')[0]}` : ''}</span>
        <span className={`lp-bn${n ? ' has' : ''}`}>{n ? `${n} to look at` : 'All clear'}</span>
      </button>
      {open && (
        <ul className="lp-board-detail">
          {r.note && <li className="lp-finding-look">{r.note}</li>}
          {list.map((f) => <li key={f.text} className={`lp-finding-${f.tone}`}>{f.text}</li>)}
        </ul>
      )}
    </li>
  );
}
