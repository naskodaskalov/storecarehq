'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ScanReply, ScanSummary } from '@/lib/scan';
import { checkupNote, findings } from '@/lib/scan-findings';
import { useBrand } from './brand-context';

const STEPS = ['Reading robots.txt', 'Loading the home page', 'Spotting the theme and apps', 'Reading the product list'];

/** Remember the scanned store for onboarding. The cookie is shared by www. and app. in production. */
export function rememberStore(host: string) {
  const domain = location.hostname.endsWith('storecarehq.com') ? '; domain=.storecarehq.com' : '';
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `sc_store=${encodeURIComponent(host)}; path=/; max-age=${7 * 86400}; samesite=lax${domain}${secure}`;
}

export function StoreScan({ signup }: { signup: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ScanReply | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1100);
    return () => clearInterval(t);
  }, [busy]);

  async function scan(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      setResult((await res.json()) as ScanReply);
    } catch {
      setResult({ ok: false, error: 'The check did not finish. Please try again in a moment.' });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    }
  }

  return (
    <div className="lp-scan" id="check">
      <form onSubmit={scan} className="lp-scan-form" aria-label="Check a Shopify store">
        <label htmlFor="scan-url" className="lp-scan-label">Try it on a client’s store, no sign-up</label>
        <div className="lp-scan-row">
          <span className="lp-scan-prefix" aria-hidden="true">https://</span>
          <input id="scan-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="clientstore.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
          <button type="submit" className="btn" disabled={busy || !url.trim()} aria-busy={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />Checking…</> : 'Check store'}
          </button>
        </div>
      </form>

      {busy && (
        <ol className="lp-scan-steps" role="status" aria-live="polite">
          {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{s}</li>)}
        </ol>
      )}

      <div ref={resultRef} tabIndex={-1} className="lp-scan-out" aria-live="polite">
        {result && !result.ok && <p className="lp-scan-error" role="alert">{result.error}</p>}
        {result?.ok && <ScanCard r={result} signup={signup} onAgain={() => { setResult(null); setUrl(''); }} />}
      </div>
    </div>
  );
}

function ScanCard({ r, signup, onAgain }: { r: ScanSummary; signup: string; onAgain: () => void }) {
  const speed = r.responseMs < 800 ? 'quick' : r.responseMs < 2000 ? 'ok' : 'slow';
  const list = findings(r);
  return (
    <section className="lp-scan-card" aria-label={`Check results for ${r.host}`}>
      <header>
        <span className="lp-scan-live" aria-hidden="true" />
        <strong>{r.host}</strong>
        <span className="lp-scan-sub">is online · first page in {(r.responseMs / 1000).toFixed(1)}s ({speed})</span>
      </header>
      <dl className="lp-scan-facts">
        <div><dt>Live theme</dt><dd>{r.theme ?? 'Not visible'}</dd></div>
        <div><dt>Products</dt><dd>{r.products ? `${r.products.count}${r.products.more ? '+' : ''} visible${r.soldOut ? `, ${r.soldOut} with sold-out sizes` : ''}` : 'Not public'}</dd></div>
        <div className="wide"><dt>Apps on the storefront ({r.appCount})</dt>
          <dd>{r.apps.length ? <ul className="lp-chips">{r.apps.map((a) => <li key={a}>{a}</li>)}{r.appCount > r.apps.length && <li className="more">+{r.appCount - r.apps.length} more</li>}</ul> : 'None detected'}</dd>
        </div>
      </dl>
      {r.note && <p className="lp-scan-note">{r.note}</p>}
      {list.length > 0 && (
        <div className="lp-findings">
          <h3>What one look shows</h3>
          <ul>{list.map((f) => <li key={f.text} className={`lp-finding-${f.tone}`}>{f.text}</li>)}</ul>
        </div>
      )}
      <Pitch r={r} list={list} />
      <p className="lp-scan-pitch">
        That’s one look. StoreCare HQ looks every 30 minutes, tests the checkout every morning, and writes down the moment
        the theme, an app or {r.products ? `any of those ${r.products.count}${r.products.more ? '+' : ''} products` : 'the catalogue'} changes.
      </p>
      <div className="lp-scan-actions">
        <a href={signup} className="btn" onClick={() => rememberStore(r.host)}>Watch {r.host} free for 7 days</a>
        <button type="button" className="lp-link-btn" onClick={onAgain}>Check another store</button>
      </div>
    </section>
  );
}

/** Turn the check into a first message to the store owner, signed by the visitor's agency.
 *  For agencies, a store check is how a care-plan conversation starts. */
function Pitch({ r, list }: { r: ScanSummary; list: ReturnType<typeof findings> }) {
  const { name, setName, color } = useBrand();
  const [open, setOpen] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const draft = checkupNote(r, name, list);
  const text = edited ?? draft;
  const subject = `A quick check on ${r.host}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the text is selectable */ }
  }

  if (!open) {
    return (
      <button type="button" className="lp-pitch-open" onClick={() => setOpen(true)} aria-expanded={false}>
        <span className="lp-pitch-badge">New client?</span>
        Turn this check into a note for the store owner →
      </button>
    );
  }
  return (
    <div className="lp-pitch" style={{ ['--brand' as string]: color }}>
      <div className="lp-pitch-head">
        <h3>A first note to the owner of {r.host}</h3>
        <input aria-label="Sign it as (your agency name)" placeholder="Sign as: your agency name" value={name} maxLength={40}
          onChange={(e) => { setName(e.target.value); setEdited(null); }} />
      </div>
      <textarea aria-label="Note to the store owner" value={text} rows={12} onChange={(e) => setEdited(e.target.value)} />
      <div className="lp-pitch-actions">
        <button type="button" className="btn secondary" onClick={copy}>{copied ? 'Copied' : 'Copy note'}</button>
        <a className="btn secondary" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`}>Open in email</a>
        {edited !== null && <button type="button" className="lp-link-btn" onClick={() => setEdited(null)}>Reset draft</button>}
      </div>
      <p className="lp-pitch-fine">Drafted from this one check; edit anything. Nothing is sent from here.</p>
    </div>
  );
}
