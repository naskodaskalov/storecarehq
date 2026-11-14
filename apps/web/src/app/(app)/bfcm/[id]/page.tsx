import Link from 'next/link';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { validAudit, type BfcmAudit } from '@/lib/bfcm';
import { auditEmailSubject, auditEmailText } from '@/lib/bfcm-email';
import { BfcmOnePager } from '@/components/bfcm-one-pager';
import { CopyButton, PrintButton } from '@/components/copy-button';
import { SubmitButton } from '@/components/submit-button';
import { Icon } from '@/components/icon';
import { saveAuditNote, sendAudit, shareAudit } from '../actions';
import { RecheckButton } from '../bfcm-board';

type Search = { shared?: string; unshared?: string; saved?: string; sent?: string; error?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

export const metadata = { title: 'BFCM one-pager · StoreCare HQ' };

export default async function AuditPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
  const q = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await supabaseServer();
  const { data: row } = await supabase.from('store_audits').select('id, store_id, agency_id, created_at, audit, note, share_token, shared_at, sent_at, sent_to').eq('id', id).maybeSingle();
  if (!row || !validAudit(row.audit)) notFound();
  const audit = row.audit as BfcmAudit;
  const [{ data: store }, { data: agency }, { data: newest }] = await Promise.all([
    supabase.from('stores').select('id, name, status, client_contact_name, client_contact_email, checkout_consent_at').eq('id', row.store_id).maybeSingle(),
    supabase.from('agencies').select('name, brand_color, logo_url').eq('id', row.agency_id).single(),
    supabase.from('store_audits').select('id, created_at').eq('store_id', row.store_id).order('created_at', { ascending: false }).limit(1),
  ]);
  const newer = newest?.[0] && newest[0].id !== row.id ? newest[0] : null;
  const brand = { name: agency?.name ?? 'Your agency', brandColor: agency?.brand_color, logoUrl: agency?.logo_url };
  const path = `/r/audit/${row.share_token}`;
  const link = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}${path}`;
  const canEmail = !!process.env.RESEND_API_KEY;
  const to = row.sent_to ?? store?.client_contact_email ?? '';
  const mailto = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(auditEmailSubject(audit))}&body=${encodeURIComponent(auditEmailText({ agencyName: brand.name, brandColor: brand.brandColor ?? '', audit, note: row.note, link, contactName: store?.client_contact_name }))}`;
  const ok = (text: string) => <div className="notice" role="status" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }}>{text}</div>;

  return (
    <div className="workspace-page bfcm-print">
      <Link href="/bfcm" className="store-back no-print"><Icon name="arrow" size={15} style={{ transform: 'rotate(180deg)' }} />BFCM audit</Link>
      <header className="page-heading no-print">
        <div>
          <h1>{audit.storeName}</h1>
          <p>Black Friday one-pager · checked {day(row.created_at)} · {row.sent_at ? `sent to ${row.sent_to} on ${day(row.sent_at)}` : row.shared_at ? 'client link on' : 'not shared yet'}</p>
        </div>
        {store && <Link href={`/stores/${store.id}`} className="btn secondary">Store page</Link>}
      </header>

      <div className="no-print" style={{ display: 'contents' }}>
        {q.error && <div className="notice error" role="alert">{q.error}</div>}
        {q.shared && ok('The client link is on. Anyone with the link can read this one-pager without logging in.')}
        {q.unshared && ok('The client link is off. It shows “not found” until you turn it on again.')}
        {q.saved && ok('Note saved. It shows on the one-pager below.')}
        {q.sent && ok(`Sent to ${row.sent_to}. The client link is on.`)}
        {newer && <div className="notice" role="status">A newer check of this store ran on {day(newer.created_at)}. <Link href={`/bfcm/${newer.id}`}>Open the latest one-pager</Link></div>}
      </div>

      <div className="bfcm-audit-layout">
        <div className="bfcm-audit-controls no-print">
          <section className="workspace-section">
            <h2>Save or share</h2>
            <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}><PrintButton /></div>
            {row.shared_at ? (
              <>
                <p className="small muted" style={{ margin: 0 }}>Client link: anyone with it can read this one-pager. No login needed.</p>
                <input type="text" readOnly value={link} className="mono small" aria-label="Client link" />
                <div className="row" style={{ justifyContent: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                  <CopyButton text={link} />
                  <a className="btn secondary" href={path} target="_blank" rel="noreferrer">Open client view</a>
                </div>
                <form action={shareAudit}><input type="hidden" name="audit" value={row.id} /><input type="hidden" name="share" value="off" /><SubmitButton secondary pendingText="Turning off…">Turn off client link</SubmitButton></form>
              </>
            ) : (
              <form action={shareAudit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <p className="small muted" style={{ margin: 0 }}>Turn on a private link to send the client. You can turn it off any time.</p>
                <input type="hidden" name="audit" value={row.id} /><input type="hidden" name="share" value="on" />
                <SubmitButton secondary pendingText="Turning on…" style={{ alignSelf: 'flex-start' }}><Icon name="link" size={15} />Turn on client link</SubmitButton>
              </form>
            )}
          </section>

          <section className="workspace-section">
            <h2>{row.sent_at ? 'Send again' : 'Send to the client'}</h2>
            <form action={sendAudit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input type="hidden" name="audit" value={row.id} />
              <div className="field"><label htmlFor="to">Client email</label><input id="to" name="to" type="email" defaultValue={to} required /></div>
              {canEmail ? (
                <>
                  <SubmitButton pendingText="Sending…"><Icon name="mail" size={15} />Send email</SubmitButton>
                  <p className="small muted" style={{ margin: 0 }}>Sent in your agency’s name and colours, with the link to this one-pager. Sending turns the client link on.</p>
                </>
              ) : row.shared_at ? (
                <>
                  <a className="btn" href={mailto}><Icon name="mail" size={15} />Open in my email app</a>
                  <p className="small muted" style={{ margin: 0 }}>A ready-written email with the fixes and the link. After you send it, mark it as sent.</p>
                  <input type="hidden" name="manual" value="1" />
                  <SubmitButton secondary pendingText="Saving…">Mark as sent</SubmitButton>
                </>
              ) : <p className="small muted" style={{ margin: 0 }}>Turn on the client link first, then send it from your email app.</p>}
            </form>
          </section>

          <form action={saveAuditNote} className="workspace-section">
            <input type="hidden" name="audit" value={row.id} />
            <h2>Note to the client</h2>
            <div className="field">
              <label htmlFor="note">Shown on the one-pager as “From {brand.name}” <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
              <textarea id="note" name="note" maxLength={1000} defaultValue={row.note ?? ''} rows={5} placeholder="For example: We’ll freeze theme and app changes from 24 November and watch the store all weekend." />
            </div>
            <SubmitButton secondary pendingText="Saving…" style={{ alignSelf: 'flex-start' }}>Save note</SubmitButton>
          </form>

          <section className="workspace-section workspace-secondary-section">
            <h2>Check again</h2>
            <p className="small muted" style={{ margin: 0 }}>After a fix, run the store again for a new, dated one-pager. This one stays as it is.</p>
            {store && store.status !== 'paused' ? <RecheckButton storeId={store.id} /> : <p className="small muted" style={{ margin: 0 }}>Monitoring is paused for this store.</p>}
            {store && !store.checkout_consent_at && <p className="small" style={{ margin: 0 }}><Link href={`/stores/${store.id}#checkout-test`}>Turn on the daily test checkout</Link> so the one-pager can show a checkout result.</p>}
          </section>
        </div>

        <div className="bfcm-audit-preview">
          <div className="small muted no-print">Preview: exactly what the client sees</div>
          <BfcmOnePager audit={audit} brand={brand} note={row.note} />
        </div>
      </div>
    </div>
  );
}
