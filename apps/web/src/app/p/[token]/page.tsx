// The client portal: one always-on page per client store, in the agency's brand. No login: the 64-character
// token in the link is the key, and public.public_store_portal() returns only client-facing data while the
// agency has the portal turned on and an active plan. The client can send requests from here.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buildPortal, PORTAL_TOKEN, type Portal, type PortalRaw, type Tone } from '@/lib/client-portal';
import { supabaseServer } from '@/lib/supabase';
import { RequestForm } from './request-form';
import './portal.css';

async function load(token: string): Promise<Portal | null> {
  if (!PORTAL_TOKEN.test(token)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('public_store_portal', { token });
  return data ? buildPortal(data as PortalRaw) : null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const p = await load((await params).token);
  return {
    title: p ? `${p.storeName} · Store care by ${p.agency.name}` : 'Client portal',
    robots: { index: false, follow: false, noarchive: true },
    referrer: 'no-referrer',
  };
}

const TONE_WORD: Record<Tone, string> = { good: 'OK', warn: 'Attention', bad: 'Problem', none: 'Info' };

export default async function ClientPortal({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const p = await load(token);
  if (!p) notFound();

  return (
    <div className="portal" style={{ ['--brand' as string]: p.agency.color }}>
      <header className="portal-top">
        <div className="portal-wrap portal-top-inner">
          <div className="portal-agency">
            {p.agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.agency.logoUrl} alt={p.agency.name} />
            ) : (
              <span className="portal-mark" aria-hidden="true">{p.agency.name.slice(0, 1)}</span>
            )}
            <span>{p.agency.name}</span>
          </div>
          <span className="portal-kicker">Store care portal</span>
        </div>
      </header>

      <main className="portal-wrap portal-main">
        <section className="portal-hero">
          <h1>{p.storeName}</h1>
          <a href={p.storeUrl} target="_blank" rel="noopener noreferrer" className="portal-host">{p.storeHost} ↗</a>
          <div className={`portal-status tone-${p.status.tone}`} role="status">
            <span className="portal-dot" aria-hidden="true" />
            <div>
              <strong>{p.status.title}</strong>
              <p>{p.status.detail}</p>
            </div>
            {p.checkedAt && <span className="portal-checked">Last check {p.checkedAt}</span>}
          </div>
        </section>

        <section className="portal-cards" aria-label="Store health">
          <article className="portal-card portal-uptime">
            <h2>Uptime, last 30 days</h2>
            <div className="portal-big">{p.uptime.pct !== null ? `${p.uptime.pct}%` : '—'}</div>
            <ol className="portal-days" aria-label="Uptime by day">
              {p.uptime.days.map((d) => (
                <li key={d.day} className={`tone-${d.tone}`} title={d.label}><span className="sr-only">{d.label}</span></li>
              ))}
            </ol>
            <div className="portal-axis"><span>30 days ago</span><span>Today</span></div>
          </article>

          <article className="portal-card">
            <h2>Checkout test</h2>
            <div className="portal-big">{p.checkout.passRate !== null ? `${p.checkout.passRate}%` : '—'}</div>
            <p className="portal-note">{p.checkout.passRate !== null ? 'of daily test orders reached checkout this month' : 'Not running on this store'}</p>
            <ul className="portal-devices">
              {p.checkout.devices.map((d) => (
                <li key={d.device} className={`tone-${d.ok === null ? 'none' : d.ok ? 'good' : 'bad'}`}><span className="portal-dot" aria-hidden="true" />{d.device}: {d.label}</li>
              ))}
            </ul>
          </article>

          <article className="portal-card">
            <h2>Mobile speed</h2>
            <div className="portal-big">{p.speed?.score ?? '—'}<small>/100</small></div>
            <p className="portal-note">
              {p.speed?.lcpSeconds ? `Main content loads in ${p.speed.lcpSeconds}s. ` : ''}
              {p.speed?.delta ? <span className={p.speed.delta > 0 ? 'up' : 'down'}>{p.speed.delta > 0 ? '+' : '−'}{Math.abs(p.speed.delta)} vs a month ago</span> : 'Home page, Google PageSpeed.'}
            </p>
            {p.health !== null && <p className="portal-note">Overall health score: <strong>{p.health}</strong></p>}
          </article>

          {p.hours && (
            <article className="portal-card">
              <h2>{p.hours.planName} · {p.monthLabel}</h2>
              <div className="portal-big">{p.hours.used}h<small> of {p.hours.available}h</small></div>
              <div className={`portal-meter${p.hours.over ? ' over' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.hours.pct} aria-label="Care-plan hours used">
                <span style={{ width: `${p.hours.pct}%` }} />
              </div>
              <p className="portal-note">
                {p.hours.over ? `${p.hours.over}h over the plan this month.` : `${p.hours.remaining}h left this month.`}
                {p.hours.rolledOver ? ` Includes ${p.hours.rolledOver}h rolled over from last month.` : ''}
              </p>
            </article>
          )}
        </section>

        <div className="portal-columns">
          <section className="portal-panel" aria-labelledby="portal-work">
            <h2 id="portal-work">Work done for you</h2>
            {p.work.length ? (
              <ul className="portal-list">
                {p.work.map((w, i) => (
                  <li key={i}><span className="portal-when">{w.date}</span><span className="portal-text">{w.text}</span><span className="portal-hours">{w.hours}h</span></li>
                ))}
              </ul>
            ) : (
              <p className="portal-empty">No work logged in the last few weeks yet.</p>
            )}

            {p.incidents.length > 0 && (
              <>
                <h3>Problems caught</h3>
                <ul className="portal-list">
                  {p.incidents.map((i, k) => (
                    <li key={k} className={i.open ? 'is-open' : undefined}>
                      <span className="portal-when">{i.when}</span>
                      <span className="portal-text"><strong>{i.title}</strong>{i.duration ? ` · fixed in ${i.duration}` : ' · being worked on'}{i.note ? <><br /><span className="portal-sub">{i.note}</span></> : null}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {p.reports.length > 0 && (
              <>
                <h3>Monthly reports</h3>
                <ul className="portal-reports">
                  {p.reports.map((r) => <li key={r.href}><a href={r.href}>{r.label} report →</a></li>)}
                </ul>
              </>
            )}
          </section>

          <section className="portal-panel" aria-labelledby="portal-requests">
            <h2 id="portal-requests">Ask {p.agency.name} for something</h2>
            <p className="portal-note">Changes, fixes, new pages, questions. It goes straight to the team looking after your store.</p>
            <RequestForm token={token} agencyName={p.agency.name} />
            {p.requests.length > 0 && (
              <>
                <h3>Your requests{p.openRequests ? ` · ${p.openRequests} open` : ''}</h3>
                <ul className="portal-list">
                  {p.requests.map((q, i) => (
                    <li key={i}>
                      <span className="portal-when">{q.when}</span>
                      <span className="portal-text">{q.subject}{q.urgent ? <span className="portal-tag">Urgent</span> : null}</span>
                      <span className={`portal-pill tone-${q.tone}`} aria-label={`${TONE_WORD[q.tone]}: ${q.status}`}>{q.status}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="portal-wrap portal-foot">
        <span>Looked after by {p.agency.name}. Checks run around the clock.</span>
        <a href="https://www.storecarehq.com/?utm_source=client_portal&amp;utm_medium=footer" target="_blank" rel="noopener">Monitored with StoreCare HQ</a>
      </footer>
    </div>
  );
}
