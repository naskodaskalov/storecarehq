import Link from 'next/link';
import { defaultReportPeriod, monthPeriod, previousPeriod } from '@storecare/reports';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { draftReport } from './actions';
import { Icon } from '@/components/icon';

const STATUS: Record<string, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'var(--text-2)' },
  approved: { label: 'Approved', tone: 'var(--accent)' },
  sent: { label: 'Sent', tone: 'var(--accent)' },
};

export default async function Reports({ searchParams }: { searchParams: Promise<{ period?: string; error?: string }> }) {
  const { period: periodParam, error } = await searchParams;
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const period = periodParam && /^\d{4}-\d{2}$/.test(periodParam) ? monthPeriod(periodParam) : defaultReportPeriod();
  const prev = previousPeriod(period);
  const next = monthPeriod(period.end);
  const thisMonth = monthPeriod(new Date().toISOString().slice(0, 7));

  const [{ data: stores }, { data: reports }] = await Promise.all([
    supabase.from('stores').select('id, name, public_url, status, client_contact_email').eq('agency_id', agency.id).order('name'),
    supabase.from('reports').select('id, store_id, status, sent_at, sent_to, updated_at, auto_drafted_at').eq('agency_id', agency.id).eq('period', period.start),
  ]);
  const byStore = new Map((reports ?? []).map((r) => [r.store_id, r]));
  const done = (reports ?? []).filter((r) => r.status !== 'draft').length;
  const toReview = (reports ?? []).filter((r) => r.status === 'draft' && r.auto_drafted_at).length;

  return (
    <div className="workspace-page reports-page">
      <header className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Client-ready reports. Care made visible.</p>
        </div>
        <span className="workspace-period"><Icon name="report" size={16} />{period.label}</span>
      </header>

      <dl className="workspace-metrics">
        <div><dt>Client stores</dt><dd>{stores?.length ?? 0}</dd></div>
        <div><dt>Drafts to review</dt><dd>{(reports ?? []).filter((report) => report.status === 'draft').length}</dd></div>
        <div><dt>Approved or sent</dt><dd>{done}<span> / {stores?.length ?? 0}</span></dd></div>
      </dl>

      {error && <div className="notice error" role="alert">{error}</div>}
      {toReview > 0 && (
        <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          {toReview} {period.label} report{toReview === 1 ? ' was' : 's were'} drafted automatically and {toReview === 1 ? 'is' : 'are'} ready for you to review.
          Nothing goes to clients until you approve and send.
        </div>
      )}

      <section className="workspace-section workspace-table-section">
        <div className="workspace-section-heading">
          <div className="report-period-nav">
            <Link href={`/reports?period=${prev.start.slice(0, 7)}`} aria-label={`Previous month, ${prev.label}`} title={`Previous month, ${prev.label}`} className="btn secondary workspace-icon-button"><Icon name="arrow" size={16} style={{ transform: 'rotate(180deg)' }} /></Link>
            <h2>{period.label}</h2>
            {period.start < thisMonth.start ? (
              <Link href={`/reports?period=${next.start.slice(0, 7)}`} aria-label={`Next month, ${next.label}`} title={`Next month, ${next.label}`} className="btn secondary workspace-icon-button"><Icon name="arrow" size={16} /></Link>
            ) : (
              <span className="workspace-icon-spacer" />
            )}
          </div>
          <span className="small muted">
            {period.start === thisMonth.start ? 'Month so far · ' : ''}
            {done} of {stores?.length ?? 0} approved or sent
          </span>
        </div>

        {!stores?.length ? (
          <p className="muted" style={{ margin: 0 }}>Add a store first. <Link href="/onboarding/store">Add store</Link></p>
        ) : (
          <div className="table-wrap">
            <table style={{ minWidth: 620 }}>
              <thead>
                <tr><th>Store</th><th>Status</th><th>Client</th><th style={{ textAlign: 'right' }}>Report</th></tr>
              </thead>
              <tbody>
                {stores.map((s) => {
                  const r = byStore.get(s.id);
                  const st = r ? STATUS[r.status] : null;
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        <div className="small muted">{host(s.public_url)}</div>
                      </td>
                      <td>
                        {st ? (
                          <span style={{ color: st.tone, fontWeight: 600 }}>
                            {r?.status === 'draft' && r.auto_drafted_at ? 'Ready to review' : st.label}
                            {r?.status === 'sent' && r.sent_at && (
                              <span className="small muted" style={{ fontWeight: 400 }}> {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                            )}
                            {r?.status === 'draft' && r.auto_drafted_at && (
                              <span className="small muted" style={{ display: 'block', fontWeight: 400 }}>
                                Drafted automatically {new Date(r.auto_drafted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="muted">Not started</span>
                        )}
                      </td>
                      <td className="small">{s.client_contact_email ?? <span className="muted">No email set</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        {r ? (
                          <Link className="btn secondary" href={`/reports/${r.id}`} style={{ height: 40 }}>Open</Link>
                        ) : (
                          <form action={draftReport} style={{ display: 'inline' }}>
                            <input type="hidden" name="store" value={s.id} />
                            <input type="hidden" name="period" value={period.start} />
                            <SubmitButton pendingText="Drafting…" style={{ height: 40 }}>Draft report</SubmitButton>
                          </form>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
