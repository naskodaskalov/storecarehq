import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_SECTIONS, factsForPrompt, type Facts, type Sections } from '@storecare/reports';
import { supabaseServer } from '@/lib/supabase';
import { SubmitButton } from '@/components/submit-button';
import { CopyButton } from '@/components/copy-button';
import { ReportView } from '@/components/report-view';
import { draftReport, reopenReport, saveReport, sendReport } from '../actions';

const SECTION_LABELS: Record<keyof Sections, string> = {
  summary: 'Summary',
  checks: 'Store health (uptime, checkout, speed)',
  incidents: 'Incidents',
  work: 'Work we did',
  changes: 'Changes to the store',
  site: 'Site checks (stock, links, renewals, SEO)',
  recommendations: 'Recommendations',
};

type Search = { drafted?: string; saved?: string; approved?: string; sent?: string; error?: string };

export default async function ReportBuilder({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const q = await searchParams;
  const supabase = await supabaseServer();
  const { data: report } = await supabase.from('reports').select('*').eq('id', id).single();
  if (!report) notFound();
  const { data: store } = await supabase.from('stores').select('id, name, client_contact_name, client_contact_email').eq('id', report.store_id).single();
  const { data: agency } = await supabase.from('agencies').select('logo_url').eq('id', report.agency_id).single();

  const facts = report.facts as Facts;
  const sections = { ...DEFAULT_SECTIONS, ...((report.sections ?? {}) as Partial<Sections>) };
  const draft = report.status === 'draft';
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/r/${report.share_token}`;
  const canEmail = !!process.env.RESEND_API_KEY;
  const to = report.sent_to ?? store?.client_contact_email ?? '';
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(`${facts.storeName}: your ${facts.period.label} care report`)}&body=${encodeURIComponent(
    `${store?.client_contact_name ? `Hi ${store.client_contact_name.split(' ')[0]},\n\n` : ''}${report.summary_text ?? ''}\n\nThe full report is here: ${link}\n\n${facts.agencyName}`,
  )}`;

  return (
    <>
      <Link href={`/reports?period=${facts.period.start.slice(0, 7)}`} style={{ fontSize: 14, textDecoration: 'none' }}>← Reports · {facts.period.label}</Link>
      <div className="row" style={{ alignItems: 'flex-end', marginTop: -12 }}>
        <div>
          <h1>{facts.storeName}</h1>
          <div className="muted">
            {facts.period.label} report ·{' '}
            <strong style={{ color: draft ? 'var(--text-2)' : 'var(--accent)' }}>
              {report.status === 'draft' ? 'Draft' : report.status === 'approved' ? 'Approved' : `Sent${report.sent_to ? ` to ${report.sent_to}` : ''}`}
            </strong>
          </div>
        </div>
        {store && <Link href={`/stores/${store.id}`} className="btn secondary">Store page</Link>}
      </div>

      {q.error && <div className="notice error" role="alert">{q.error}</div>}
      {q.drafted && (
        <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          Draft ready, built from this month&apos;s checks, changes and work log.{' '}
          {q.drafted === 'ai' ? 'The summary was written by AI from those facts only. Read it before approving.' : 'The summary uses the standard template; edit it as you like.'}
        </div>
      )}
      {draft && report.auto_drafted_at && !q.drafted && !q.saved && (
        <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>
          Drafted automatically on {new Date(report.auto_drafted_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} from {facts.period.label}&apos;s checks, changes and work log.{' '}
          {report.summary_source === 'ai' ? 'The summary was written by AI from those facts only.' : 'The summary uses the standard template.'} Read it, adjust anything, then approve.
          {' '}Work you log for {facts.period.label} after this is picked up by &ldquo;Refresh from latest data&rdquo;.
        </div>
      )}
      {q.saved && <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>Saved.</div>}
      {q.approved && <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>Approved. The client link below now works; send it when you&apos;re ready.</div>}
      {q.sent && <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>Marked as sent.</div>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 340px', minWidth: 0, maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {draft ? (
            <>
              <form action={saveReport} className="card">
                <input type="hidden" name="report" value={report.id} />
                <h2>Edit</h2>
                <div className="field">
                  <label htmlFor="summary">
                    Summary{' '}
                    <span className="muted" style={{ fontWeight: 400 }}>
                      ({report.summary_source === 'ai' ? 'written by AI' : report.summary_source === 'edited' ? 'edited by you' : 'template'})
                    </span>
                  </label>
                  <textarea id="summary" name="summary" defaultValue={report.summary_text ?? ''} style={{ minHeight: 170 }} />
                </div>
                <details className="small">
                  <summary className="muted" style={{ cursor: 'pointer' }}>What the summary is based on</summary>
                  <pre className="mono" style={{ whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 12 }}>{factsForPrompt(facts)}</pre>
                </details>
                <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 6 }}>Sections the client sees</legend>
                  {(Object.keys(SECTION_LABELS) as (keyof Sections)[]).map((k) => (
                    <label key={k} className="check" style={{ alignItems: 'center', minHeight: 36 }}>
                      <input type="checkbox" name={`section_${k}`} defaultChecked={sections[k]} style={{ marginTop: 0 }} /> {SECTION_LABELS[k]}
                    </label>
                  ))}
                </fieldset>
                <div className="row">
                  <SubmitButton secondary pendingText="Saving…" name="intent" value="save">Save and preview</SubmitButton>
                  <SubmitButton pendingText="Approving…" name="intent" value="approve">Approve</SubmitButton>
                </div>
              </form>
              <form action={draftReport} className="card">
                <input type="hidden" name="store" value={report.store_id} />
                <input type="hidden" name="period" value={facts.period.start} />
                <h2>Refresh data</h2>
                <p className="small muted" style={{ margin: 0 }}>
                  Rebuilds the numbers and the summary from the latest checks and work log. Your summary edits are replaced; section choices stay.
                </p>
                <SubmitButton secondary pendingText="Refreshing…" style={{ alignSelf: 'flex-start' }}>Refresh from latest data</SubmitButton>
              </form>
            </>
          ) : (
            <>
              <section className="card">
                <h2>Client link</h2>
                <p className="small muted" style={{ margin: 0 }}>Anyone with this link can read the report. It doesn&apos;t need a login.</p>
                <input type="text" readOnly value={link} className="mono small" aria-label="Client link" />
                <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
                  <CopyButton text={link} />
                  <a className="btn secondary" href={`/r/${report.share_token}`} target="_blank" rel="noreferrer">Open client view</a>
                </div>
              </section>

              <section className="card">
                <h2>{report.status === 'sent' ? 'Send again' : 'Send to client'}</h2>
                <form action={sendReport} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <input type="hidden" name="report" value={report.id} />
                  <div className="field">
                    <label htmlFor="to">Client email</label>
                    <input id="to" name="to" type="email" defaultValue={to} required />
                  </div>
                  {canEmail ? (
                    <SubmitButton pendingText="Sending…">Send email</SubmitButton>
                  ) : (
                    <>
                      <a className="btn" href={mailto}>Open in my email app</a>
                      <p className="small muted" style={{ margin: 0 }}>
                        Opens a ready-written email with the summary and link. After you send it, mark the report as sent.
                      </p>
                      <input type="hidden" name="manual" value="1" />
                      <SubmitButton secondary pendingText="Saving…">Mark as sent</SubmitButton>
                    </>
                  )}
                </form>
              </section>

              <form action={reopenReport} className="card">
                <input type="hidden" name="report" value={report.id} />
                <h2>Need a change?</h2>
                <p className="small muted" style={{ margin: 0 }}>Reopening turns the report back into a draft. The client link stops working until you approve it again.</p>
                <SubmitButton secondary pendingText="Reopening…" style={{ alignSelf: 'flex-start' }}>Reopen for edits</SubmitButton>
              </form>
            </>
          )}
        </div>

        <div style={{ flex: '2 1 520px', minWidth: 0 }}>
          <div className="small muted" style={{ marginBottom: 8 }}>Preview: exactly what the client sees</div>
          <ReportView facts={facts} summary={report.summary_text ?? ''} sections={sections} logoUrl={agency?.logo_url} />
        </div>
      </div>
    </>
  );
}
