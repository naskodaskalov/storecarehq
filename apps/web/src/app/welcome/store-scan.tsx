'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ScanReply, ScanSummary } from '@/lib/scan';
import { checkupNote, findings, parseStoreList } from '@/lib/scan-findings';
import { forgetStore, forgetStores, loadStores, remember, saveStore, STORES_EVENT, whenLabel, type StoreMemory } from '@/lib/store-memory';
import { storeName } from '@/lib/store-preview';
import { useBrand, type CheckedStore } from './brand-context';
import { track } from '@/components/analytics';

const STEPS = ['Reading robots.txt', 'Loading the home page', 'Spotting the theme and apps', 'Reading the product list'];
/** A store checked less than an hour ago isn't worth a "welcome back". */
const WELCOME_AFTER_MS = 60 * 60_000;

/** Remember the scanned store for onboarding. The cookie is shared by www. and app. in production. */
export function rememberStore(host: string) {
  const domain = location.hostname.endsWith('storecarehq.com') ? '; domain=.storecarehq.com' : '';
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `sc_store=${encodeURIComponent(host)}; path=/; max-age=${7 * 86400}; samesite=lax${domain}${secure}`;
}

/** Fold a successful check into what this browser remembers about the store, and say what changed since last time. */
export function recordCheck(scan: ScanSummary): CheckedStore {
  const prev = loadStores().find((m) => m.host === scan.host);
  const { memory, found } = remember(prev, scan.host, scan.siteName, scan.fp);
  saveStore(memory);
  const saved = loadStores().some((m) => m.host === scan.host);
  return { scan, memory, found, seenBefore: prev ? prev.looks.at(-1)! : null, saved };
}

/** The stores this browser remembers, kept current when another part of the page (or another tab) checks one. */
export function useRememberedStores(): StoreMemory[] {
  const [stores, setStores] = useState<StoreMemory[]>([]);
  useEffect(() => {
    const load = () => setStores(loadStores());
    load();
    window.addEventListener(STORES_EVENT, load);
    window.addEventListener('storage', load);
    return () => {
      window.removeEventListener(STORES_EVENT, load);
      window.removeEventListener('storage', load);
    };
  }, []);
  return stores;
}

export function StoreScan({ signup }: { signup: string }) {
  const { setChecked } = useBrand();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ScanReply | null>(null);
  const [checked, setLocal] = useState<CheckedStore | null>(null);
  const remembered = useRememberedStores();
  const resultRef = useRef<HTMLDivElement>(null);
  const typed = parseStoreList(url).stores[0];
  const known = !!typed && remembered.some((m) => m.host === typed);
  const steps = known ? [...STEPS, 'Comparing with your last check'] : STEPS;

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1100);
    return () => clearInterval(t);
  }, [busy, steps.length]);

  async function run(target: string) {
    if (!target.trim() || busy) return;
    setBusy(true);
    setResult(null);
    setLocal(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: target }) });
      const reply = (await res.json()) as ScanReply;
      if (reply.ok && reply.fp) {
        const c = recordCheck(reply);
        setLocal(c);
        setChecked(c);
      }
      setResult(reply);
      track('store_check', { result: reply.ok ? 'ok' : 'error' });
    } catch {
      setResult({ ok: false, error: 'The check did not finish. Please try again in a moment.' });
    } finally {
      setBusy(false);
      requestAnimationFrame(() => resultRef.current?.focus());
    }
  }

  function scan(e: FormEvent) {
    e.preventDefault();
    run(url);
  }

  function again(host: string) {
    setUrl(host);
    run(host);
  }

  const last = remembered[0];
  const welcome = !result && !busy && last && Date.now() - Date.parse(last.looks.at(-1)!) > WELCOME_AFTER_MS ? last : null;

  return (
    <div className="lp-scan" id="check">
      {welcome && (
        <div className="lp-back">
          <p>
            <span className="lp-back-dot" aria-hidden="true" />
            Welcome back. You checked <strong>{welcome.name ?? welcome.host}</strong> {whenLabel(welcome.looks.at(-1)!)}. Want to see what changed since?
          </p>
          <div className="lp-back-actions">
            <button type="button" className="btn" onClick={() => again(welcome.host)}>Check {welcome.host} again</button>
            {remembered.slice(1, 4).map((m) => (
              <button key={m.host} type="button" className="lp-back-chip" onClick={() => again(m.host)}>{m.host}</button>
            ))}
            <button type="button" className="lp-link-btn" onClick={() => forgetStores()}>Forget these</button>
          </div>
        </div>
      )}

      <form onSubmit={scan} className="lp-scan-form" aria-label="Check a Shopify store">
        <label htmlFor="scan-url" className="lp-scan-label">Try it on a client’s store: see the report you’d send, no sign-up</label>
        <div className="lp-scan-row">
          <span className="lp-scan-prefix" aria-hidden="true">https://</span>
          <input id="scan-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="clientstore.com" value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
          <button type="submit" className="btn" disabled={busy || !url.trim()} aria-busy={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />Checking…</> : known ? 'Check again' : 'Check store'}
          </button>
        </div>
      </form>

      {busy && (
        <ol className="lp-scan-steps" role="status" aria-live="polite">
          {steps.map((s, i) => <li key={s} className={i < step ? 'done' : i === step ? 'now' : ''}>{s}</li>)}
        </ol>
      )}

      <div ref={resultRef} tabIndex={-1} className="lp-scan-out" aria-live="polite">
        {result && !result.ok && <p className="lp-scan-error" role="alert">{result.error}</p>}
        {result?.ok && checked && (
          <ScanCard c={checked} signup={signup} onAgain={() => { setResult(null); setLocal(null); setUrl(''); }} />
        )}
      </div>
    </div>
  );
}

function ScanCard({ c, signup, onAgain }: { c: CheckedStore; signup: string; onAgain: () => void }) {
  const { name: agency } = useBrand();
  const [forgotten, setForgotten] = useState(false);
  const r = c.scan;
  const speed = r.responseMs < 800 ? 'quick' : r.responseMs < 2000 ? 'ok' : 'slow';
  const name = storeName(r, c.memory);

  function showReport() {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById('hero-report')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  }

  return (
    <section className="lp-scan-card" aria-label={`Check results for ${r.host}`}>
      <header>
        <span className="lp-scan-live" aria-hidden="true" />
        <strong>{r.host}</strong>
        <span className="lp-scan-sub">is online · first page in {(r.responseMs / 1000).toFixed(1)}s ({speed})</span>
      </header>

      {c.seenBefore ? <Since c={c} /> : (
        <p className="lp-saved">
          <strong>{name}’s report has started</strong>
          {agency.trim() ? `, under ${agency.trim()}’s name. ` : '. Type your agency name above it to put it under yours. '}
          {!c.saved ? 'Your browser isn’t letting this page keep anything, so this check won’t be remembered next time.' : forgotten ? 'Forgotten: nothing about it is kept in this browser now.' : (
            <>
              This check is saved in your browser and nowhere else: check {r.host} again in a few days and you’ll see
              what changed in between.{' '}
              <button type="button" className="lp-link-btn" onClick={() => { forgetStore(r.host); setForgotten(true); }}>Forget it</button>
            </>
          )}
        </p>
      )}

      <button type="button" className="lp-see-report" onClick={showReport}>See {name}’s report ↓</button>

      <div className="lp-scan-actions">
        <a href={signup} className="btn" onClick={() => rememberStore(r.host)}>Watch {r.host} free for 7 days</a>
        <button type="button" className="lp-link-btn" onClick={onAgain}>Check another store</button>
      </div>
      <Pitch r={r} list={findings(r)} />
    </section>
  );
}

/** What changed since this visitor last checked the store: the product's change log, in miniature. */
function Since({ c }: { c: CheckedStore }) {
  const when = whenLabel(c.seenBefore!);
  const r = c.scan;
  if (!r.fp.home) {
    return (
      <div className="lp-since">
        <h3>Since your last check {when}</h3>
        <p>The store’s firewall turned this check away, so there was nothing to compare. StoreCare records blocked visits and keeps checking.</p>
      </div>
    );
  }
  if (!c.found.length) {
    const same = [
      c.memory.last.theme && 'same theme',
      r.appCount && `same ${r.appCount} apps`,
      r.products && !r.products.more && `same ${r.products.count} products`,
    ].filter(Boolean).join(', ');
    return (
      <div className="lp-since">
        <h3>Since your last check {when}</h3>
        <p>Nothing changed{same ? `: ${same}` : ''}. A quiet stretch like this still goes in the report: it’s what the client is paying for.</p>
      </div>
    );
  }
  return (
    <div className="lp-since has">
      <h3>Since your last check {when}: {c.found.length} change{c.found.length === 1 ? '' : 's'}</h3>
      <ul>
        {c.found.map((ch, i) => <li key={i} className={ch.risky ? 'risky' : undefined}>{ch.summary}</li>)}
      </ul>
      <p>Did the client mention any of this? StoreCare would have told you within the hour.</p>
    </div>
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
