'use client';

// Google Analytics 4 for the public website, loaded only after the visitor agrees.
// Nothing is sent to Google before consent (not even cookieless pings), so the banner is a real choice.
// Needs NEXT_PUBLIC_GA_ID (the "G-…" measurement ID); without it this renders nothing.

import Script from 'next/script';
import { useEffect, useState } from 'react';

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;
const KEY = 'sc_analytics';
const OPEN_EVENT = 'sc:cookie-settings';

type Choice = 'granted' | 'denied';
type Gtag = (...args: unknown[]) => void;

function readChoice(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'granted' || v === 'denied' ? v : null;
  } catch {
    return null;
  }
}

function saveChoice(choice: Choice) {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* storage blocked: the banner shows again next visit */
  }
}

/** Removes Google Analytics cookies after consent is withdrawn. */
function clearGaCookies() {
  const host = location.hostname.replace(/^www\./, '');
  for (const name of document.cookie.split(';').map((c) => c.split('=')[0].trim())) {
    if (name !== '_ga' && !name.startsWith('_ga_')) continue;
    for (const domain of ['', `; domain=${host}`, `; domain=.${host}`]) document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
  }
}

/** Sends a custom event when analytics is on; does nothing otherwise. */
export function track(name: string, params: Record<string, string | number> = {}) {
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (gtag && readChoice() === 'granted') gtag('event', name, params);
}

/** A footer link that reopens the cookie choice, so consent can be withdrawn as easily as it was given. */
export function CookieSettingsLink({ className }: { className?: string }) {
  if (!GA_ID) return null;
  return (
    <button type="button" className={className ?? 'cookie-settings-link'} onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}

export function Analytics() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = readChoice();
    setChoice(saved);
    setOpen(saved === null);
    setReady(true);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  // Count the actions that matter: trial and sign-in clicks.
  useEffect(() => {
    if (choice !== 'granted') return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]');
      const href = a?.getAttribute('href') ?? '';
      if (/\/login\?trial=1/.test(href)) track('start_trial_click', { link_text: (a?.textContent ?? '').trim().slice(0, 60) });
      else if (/\/login(\?|$)/.test(href)) track('sign_in_click');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [choice]);

  if (!GA_ID || !ready) return null;

  const decide = (next: Choice) => {
    saveChoice(next);
    setOpen(false);
    if (next === 'denied' && choice === 'granted') {
      clearGaCookies();
      location.reload(); // unloads the already-running tag
      return;
    }
    setChoice(next);
  };

  return (
    <>
      {choice === 'granted' && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'granted'});gtag('config','${GA_ID}',{allow_google_signals:false,allow_ad_personalization_signals:false});`}
          </Script>
        </>
      )}
      {open && (
        <div className="cookie-banner" role="dialog" aria-live="polite" aria-label="Cookie choice">
          <p>
            We’d like to use Google Analytics to see how visitors find and use this site. It sets cookies and only runs if you agree.{' '}
            <a href="/privacy#cookies">Privacy</a>
          </p>
          <div className="cookie-banner-actions">
            <button type="button" className="cookie-btn" onClick={() => decide('denied')}>Decline</button>
            <button type="button" className="cookie-btn cookie-btn-primary" onClick={() => decide('granted')}>Accept</button>
          </div>
        </div>
      )}
    </>
  );
}
