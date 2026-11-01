'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ScanReply, ScanSummary } from '@/lib/scan';

const STEPS = ['Reading robots.txt', 'Loading the home page', 'Spotting the theme and apps', 'Reading the product list'];

/** Remember the scanned store for onboarding. The cookie is shared by www. and app. in production. */
function rememberStore(host: string) {
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
