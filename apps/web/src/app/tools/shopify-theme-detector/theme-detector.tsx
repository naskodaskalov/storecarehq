'use client';

import { useState, type FormEvent } from 'react';
import type { ScanReply, ScanSummary } from '@/lib/scan';
import { track } from '@/components/analytics';

/** Names of the free themes Shopify itself makes (current and older), so we can say "a free Shopify theme". */
const SHOPIFY_FREE_THEME_NAMES = new Set(['dawn', 'refresh', 'sense', 'craft', 'crave', 'colorblock', 'taste', 'studio', 'ride', 'origin', 'spotlight', 'publisher', 'trade', 'horizon', 'debut', 'brooklyn', 'minimal', 'narrative', 'simple', 'supply', 'venture', 'boundless', 'express']);

function describeSource(s: ScanSummary): string {
  const d = s.themeDetail;
  if (!d) return '';
  const base = (d.base ?? '').toLowerCase();
  if (d.themeStoreId && SHOPIFY_FREE_THEME_NAMES.has(base)) return 'A free theme made by Shopify, from the Shopify Theme Store.';
  if (d.themeStoreId) return 'A theme from the Shopify Theme Store.';
  return 'Not linked to the Shopify Theme Store: a custom build, or a theme bought and installed outside the store.';
}

export function ThemeDetector({ signup }: { signup: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanReply | null>(null);

  async function run(e: FormEvent) {
    e.preventDefault();
    const target = url.trim();
    if (!target) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/scan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: target }) });
      const reply = (await res.json()) as ScanReply;
      setResult(reply);
      track('theme_detect', { result: reply.ok ? (reply.themeDetail ? 'found' : 'no_theme') : 'error' });
    } catch {
      setResult({ ok: false, error: 'The check did not finish. Please try again in a moment.' });
    } finally {
      setBusy(false);
    }
  }

  const s = result?.ok ? result : null;
  const d = s?.themeDetail ?? null;
  const renamed = d && d.base && d.name && d.name.trim().toLowerCase() !== d.base.trim().toLowerCase();

  return (
    <div className="td-tool" id="detector">
      <form className="td-form" onSubmit={run}>
        <label htmlFor="td-url" className="sr-only">Shopify store address</label>
        <input
          id="td-url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Paste a store address, like allbirds.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn lp-btn-big" disabled={busy} aria-busy={busy}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Detecting…' : 'Detect theme'}
        </button>
      </form>
      <p className="td-hint">Free, no sign-up. Takes about 10 seconds.</p>

      <div aria-live="polite">
        {result && !result.ok && <p className="td-error" role="alert">{result.error}</p>}

        {s && (
          <div className="td-result">
            <p className="td-result-host">{s.siteName ? `${s.siteName} · ` : ''}{s.host}</p>
            {d ? (
              <>
                <p className="td-label">Live theme</p>
                <p className="td-theme">{d.base ?? d.name ?? 'Custom theme'}{d.version ? <span className="td-version"> {d.version}</span> : null}</p>
                {renamed && <p className="td-line">The store calls its copy <strong>“{d.name}”</strong>. That is a renamed copy of {d.base}.</p>}
                <p className="td-line">{describeSource(s)}</p>
                {s.apps.length > 0 && (
                  <>
                    <p className="td-label">Apps and services we also spotted</p>
                    <ul className="td-apps">{s.apps.map((a) => <li key={a}>{a}</li>)}</ul>
                    {s.appCount > s.apps.length && <p className="td-line td-muted">and {s.appCount - s.apps.length} more.</p>}
                  </>
                )}
              </>
            ) : (
              <p className="td-line">{s.note ?? 'We could not read a theme on this store.'} Headless stores (built with Hydrogen or another framework) don’t use a Shopify theme at all.</p>
            )}
            <div className="td-upsell">
              <p><strong>Look after this store for a client?</strong> StoreCare HQ watches it every day and tells you when the theme, apps, speed or checkout change.</p>
              <a href={signup} className="btn">Watch it free for 7 days</a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
