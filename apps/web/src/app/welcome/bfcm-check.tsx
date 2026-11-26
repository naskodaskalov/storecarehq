'use client';

// The Black Friday war room: a live countdown and the readiness one-pager for any client store, branded with the
// agency name the visitor typed in the hero. Shown only around the sale (bfcmLive in lib/bfcm-check.ts).

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { BfcmCheckReply } from '@/lib/bfcm-check';
import { BfcmOnePager } from '@/components/bfcm-one-pager';
import { shortDate } from '@/lib/bfcm';
import { track } from '@/components/analytics';
import { useBrand } from './brand-context';
import { rememberStore } from './store-scan';

const STEPS = ['Opening the storefront', 'Checking it’s open and Google can list it', 'Checking the products on the home page', 'Reading the certificate and domain', 'Timing mobile speed'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Time left until Black Friday starts at midnight where the visitor is; null once the sale has begun. */
function useCountdown(blackFriday: string) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const [y, m, d] = blackFriday.split('-').map(Number);
    const start = new Date(y, m - 1, d).getTime();
    const tick = () => setLeft(Math.max(0, start - Date.now()));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [blackFriday]);
  return left;
}

export function BfcmCheck({ signup, blackFriday, cyberMonday, label }: { signup: string; blackFriday: string; cyberMonday: string; label: string }) {
  const { name, color } = useBrand();
  const left = useCountdown(blackFriday);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<BfcmCheckReply | null>(null);
  const outRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    return () => clearInterval(t);
  }, [busy]);

  async function check(e: FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/bfcm-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) });
      const reply = (await res.json()) as BfcmCheckReply;
      setResult(reply);
      track('bfcm_check', { result: reply.ok ? reply.audit.verdict : 'error' });
    } catch {
      setResult({ ok: false, error: 'The check did not finish. Please try again in a moment.' });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => outRef.current?.focus());
    }
  }

  const audit = result?.ok ? result.audit : null;
  const counting = left !== null && left > 0;
  const h = left === null ? 0 : Math.floor(left / 3_600_000);
  const days = Math.floor(h / 24);

  return (
    <div className="lp-bf-inner">
      <div className="lp-bf-head">
        <div>
          <p className="lp-bf-kicker"><span className="lp-bf-dot" aria-hidden="true" />{label}</p>
          <h2 id="bfcm-title">Is your client’s store ready for Black Friday?</h2>
          <p className="lp-bf-lede">
            One free check of the things that cost sales on the biggest weekend of the year: password page left on,
            Google blocked, sold-out products on the home page, expiring certificates and domains, app bloat and slow
            mobile pages. You get the one-pager to send your client, with your agency’s name on it.
          </p>
        </div>
        <div className="lp-bf-clock" role="timer" aria-label={label}>
          {counting ? (
            <>
              <div className="lp-bf-digits">
                {days > 0 && <span><strong>{days}</strong><small>days</small></span>}
                <span><strong>{pad(h % 24)}</strong><small>hrs</small></span>
                <span><strong>{pad(Math.floor(left! / 60_000) % 60)}</strong><small>min</small></span>
                <span><strong>{pad(Math.floor(left! / 1000) % 60)}</strong><small>sec</small></span>
              </div>
              <p>until Black Friday starts where you are</p>
            </>
          ) : (
            <>
              <div className="lp-bf-live">Sale is live</div>
              <p>{shortDate(blackFriday)} – {shortDate(cyberMonday)}. Check before the next traffic wave.</p>
            </>
          )}
        </div>
      </div>

      <form className="lp-bf-form" onSubmit={check} aria-label="Black Friday readiness check">
        <label htmlFor="bf-url">Client store</label>
        <div className="lp-scan-row">
          <span className="lp-scan-prefix" aria-hidden="true">https://</span>
          <input id="bf-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="clientstore.com" autoComplete="off" spellCheck={false} inputMode="url" />
          <button type="submit" className="btn" disabled={busy || !url.trim()} aria-busy={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />Checking…</> : 'Check readiness'}
          </button>
        </div>
        <p className="lp-bf-small">Free, no sign-up. Outside checks only: no store access, nothing ordered, nothing stored.</p>
      </form>

      {busy && (
        <ol className="lp-scan-steps lp-bf-steps" role="status" aria-live="polite">
          {STEPS.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{s}</li>)}
        </ol>
      )}

      <div ref={outRef} tabIndex={-1} className="lp-scan-out" aria-live="polite">
        {result && !result.ok && <p className="lp-scan-error" role="alert">{result.error}</p>}
        {audit && (
          <div className="lp-bf-result">
            <BfcmOnePager audit={audit} brand={{ name: name.trim() || 'Your agency', brandColor: color }} embedded />
            <aside className="lp-bf-pitch">
              <h3>{audit.fixes ? `Fixing ${audit.fixes === 1 ? 'it' : 'them'} is step one. Knowing it stays fixed is step two.` : 'Ready today. Make sure it’s still ready on Saturday.'}</h3>
              <p>
                Sale weekends are when apps update, stock runs out and checkouts break. StoreCare HQ checks every client
                store every 30 minutes, runs a test checkout each morning, and alerts you by email or Slack before the
                client notices.
              </p>
              <ul>
                <li>The daily checkout test this outside check can’t run</li>
                <li>Uptime every 30 minutes, alerts after two failures</li>
                <li>This one-pager for every client store, in one click</li>
              </ul>
              <a href={signup} className="btn lp-btn-big" onClick={() => { rememberStore(audit.host); track('bfcm_check_signup', { verdict: audit.verdict }); }}>
                Watch {audit.host} through Cyber Monday
              </a>
              <span className="lp-bf-small">7 days free. First checks within half an hour. {name.trim() ? '' : 'Type your agency name in the report at the top to brand this page.'}</span>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
