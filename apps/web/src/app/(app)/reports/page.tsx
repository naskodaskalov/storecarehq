import Link from 'next/link';
import { defaultReportPeriod, monthPeriod, previousPeriod } from '@storecare/reports';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { host } from '@/lib/format';
import { SubmitButton } from '@/components/submit-button';
import { draftReport } from './actions';

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
    supabase.from('reports').select('id, store_id, status, sent_at, sent_to, updated_at').eq('agency_id', agency.id).eq('period', period.start),
  ]);
  const byStore = new Map((reports ?? []).map((r) => [r.store_id, r]));
  const done = (reports ?? []).filter((r) => r.status !== 'draft').length;

  return (
    <>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div>
          <h1>Reports</h1>
          <div className="muted">
            Draft each store&apos;s monthly report, review it, approve it, then send the client a link.
          </div>
        </div>
      </div>

      {error && <div className="notice error" role="alert">{error}</div>}

      <section className="card">
        <div className="row">
          <div className="row" style={{ gap: 12, justifyContent: 'flex-start' }}>
            <Link href={`/reports?period=${prev.start.slice(0, 7)}`} aria-label={`Previous month, ${prev.label}`} className="btn secondary" style={{ height: 40, padding: '0 12px' }}>←</Link>
            <h2 style={{ minWidth: 160, textAlign: 'center' }}>{period.label}</h2>
            {period.start < thisMonth.start ? (
              <Link href={`/reports?period=${next.start.slice(0, 7)}`} aria-label={`Next month, ${next.label}`} className="btn secondary" style={{ height: 40, padding: '0 12px' }}>→</Link>
            ) : (
              <span style={{ width: 44 }} />
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
                            {st.label}
                            {r?.status === 'sent' && r.sent_at && (
                              <span className="small muted" style={{ fontWeight: 400 }}> {new Date(r.sent_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
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
    </>
  );
}
