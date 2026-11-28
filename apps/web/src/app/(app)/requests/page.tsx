import Link from 'next/link';
import { headers } from 'next/headers';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { portalUrl, REQUEST_STATUS } from '@/lib/client-portal';
import { when } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { CopyButton } from '@/components/copy-button';
import { Icon } from '@/components/icon';
import { setRequestStatus } from './actions';

type Req = {
  id: string; store_id: string; subject: string; body: string | null; from_name: string | null; from_email: string | null;
  status: 'new' | 'in_progress' | 'done'; urgency: 'normal' | 'urgent'; source: string; received_at: string; work_entry_id: string | null;
};

const SAVED: Record<string, string> = {
  in_progress: 'Marked in progress. Your client sees it in their portal.',
  done: 'Marked done. Your client sees it in their portal.',
  new: 'Moved back to new.',
};

export default async function Requests({ searchParams }: { searchParams: Promise<{ view?: string; saved?: string; error?: string }> }) {
  const { view = 'open', saved, error } = await searchParams;
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const [{ data: rows }, { data: stores }] = await Promise.all([
    supabase.from('requests').select('id, store_id, subject, body, from_name, from_email, status, urgency, source, received_at, work_entry_id')
      .eq('agency_id', agency.id).order('received_at', { ascending: false }).limit(300),
    supabase.from('stores').select('id, name, timezone, portal_token').eq('agency_id', agency.id).order('name'),
  ]);
  const all = (rows ?? []) as Req[];
  const storeById = new Map((stores ?? []).map((s) => [s.id, s]));
  const open = all.filter((r) => r.status !== 'done');
  const shown = (view === 'done' ? all.filter((r) => r.status === 'done') : view === 'all' ? all : open)
    .sort((a, b) => (view === 'open' ? Number(b.urgency === 'urgent') - Number(a.urgency === 'urgent') || Number(a.status === 'in_progress') - Number(b.status === 'in_progress') : 0) || b.received_at.localeCompare(a.received_at));
  const withPortal = (stores ?? []).filter((s) => s.portal_token);
  const withoutPortal = (stores ?? []).filter((s) => !s.portal_token);
  const host = (await headers()).get('host') ?? '';
  const urgentOpen = open.filter((r) => r.urgency === 'urgent').length;

  return (
    <div className="workspace-page requests-page">
      <header className="page-heading">
        <div><h1>Client requests</h1><p>What your clients asked for from their portal, in one inbox.</p></div>
      </header>

      <dl className="workspace-metrics">
        <div><dt>Open</dt><dd>{open.length}</dd></div>
        <div><dt>Urgent</dt><dd className={urgentOpen ? 'warn' : undefined}>{urgentOpen}</dd></div>
        <div><dt>Client portals on</dt><dd>{withPortal.length}<span> / {stores?.length ?? 0}</span></dd></div>
      </dl>

      {saved && SAVED[saved] && <div className="notice" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }} role="status">{SAVED[saved]}</div>}
      {error && <div className="notice error" role="alert">Could not update that request. Please try again.</div>}

      <nav className="requests-tabs" aria-label="Filter requests">
        {[['open', `Open (${open.length})`], ['done', 'Done'], ['all', 'All']].map(([key, label]) => (
          <Link key={key} href={`/requests?view=${key}`} aria-current={view === key ? 'page' : undefined}>{label}</Link>
        ))}
      </nav>

      <section className="workspace-section workspace-table-section" aria-label="Requests">
        {!shown.length ? (
          <p className="muted" style={{ margin: 0 }}>
            {view === 'open' ? 'No open requests. ' : 'Nothing here yet. '}
            {withPortal.length ? 'New requests from client portals appear here and alert you by email and Slack.' : 'Turn on a client portal in a store’s settings, send the link to your client, and their requests arrive here.'}
          </p>
        ) : (
          <ul className="request-list">
            {shown.map((r) => {
              const store = storeById.get(r.store_id);
              const t = when(r.received_at, store?.timezone ?? undefined);
              const next = r.status === 'new' ? 'in_progress' : r.status === 'in_progress' ? 'done' : 'new';
              const label = r.status === 'new' ? 'Start' : r.status === 'in_progress' ? 'Mark done' : 'Reopen';
              return (
                <li key={r.id} className={`request-item${r.urgency === 'urgent' && r.status !== 'done' ? ' is-urgent' : ''}`}>
                  <div className="request-main">
                    <div className="request-meta">
                      <Link href={`/stores/${r.store_id}`}>{store?.name ?? 'Store'}</Link>
                      <span>{t.date}, {t.time}</span>
                      {r.urgency === 'urgent' && <span className="request-urgent">Urgent</span>}
                      <span className={`request-status status-${r.status}`}>{REQUEST_STATUS[r.status].label}</span>
                    </div>
                    <h3>{r.subject}</h3>
                    {r.body && <p className="request-body">{r.body}</p>}
                    <div className="small muted">
                      {r.from_name ?? 'Client'}{r.from_email ? <> · <a href={`mailto:${r.from_email}?subject=${encodeURIComponent(`Re: ${r.subject}`)}`}>{r.from_email}</a></> : null}
                      {r.work_entry_id ? ' · work logged' : ''}
                    </div>
                  </div>
                  <div className="request-actions">
                    <form action={setRequestStatus}>
                      <input type="hidden" name="request" value={r.id} /><input type="hidden" name="status" value={next} /><input type="hidden" name="view" value={view} />
                      <SubmitButton secondary={r.status === 'done'} pendingText="Saving…">{label}</SubmitButton>
                    </form>
                    {r.status !== 'done' && (
                      <Link className="btn secondary" href={`/work?store=${r.store_id}&request=${r.id}`}><Icon name="clock" size={16} />Log work &amp; close</Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="workspace-section" aria-labelledby="portal-links">
        <h2 id="portal-links">Client portal links</h2>
        <p className="small muted" style={{ margin: 0 }}>One always-on page per client in your brand: status, uptime, hours used, work done, reports, and this request form. Put it in your email signature or the client’s bookmarks bar.</p>
        {withPortal.length > 0 && (
          <ul className="portal-link-list">
            {withPortal.map((s) => {
              const url = portalUrl(host, s.portal_token!);
              return (
                <li key={s.id}><strong>{s.name}</strong><span className="mono small muted portal-link-url">{url}</span><CopyButton text={url} /></li>
              );
            })}
          </ul>
        )}
        {withoutPortal.length > 0 && (
          <p className="small" style={{ margin: 0 }}>
            Not on yet: {withoutPortal.map((s, i) => <span key={s.id}>{i ? ', ' : ''}<Link href={`/stores/${s.id}/settings#client-portal`}>{s.name}</Link></span>)}
          </p>
        )}
      </section>
    </div>
  );
}
