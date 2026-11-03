'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { defaultOutreachSubject, outreachEmail } from '@/lib/outreach-email';
import type { Pack, ReportLinks } from '@/lib/outreach';
import { contactDay, type OutreachContact } from '@/lib/outreach-history';
import { approveOutreachTest, sendOutreachTest, publishOutreachReports, revokeOutreachReports } from './actions';

export type TestSenderInfo = { from: string; to: string; replyTo?: string; mode: 'agency' | 'test'; ready: boolean; storageReady: boolean; reason: string };

export function EmailComposer({ pack, sender, busy, previous, timeZone, onSubject, onLinks, onSent, editor }: { pack: Pack; sender: TestSenderInfo; busy: boolean; previous: OutreachContact | null; timeZone: string; onSubject: (value: string) => void; onLinks: (value: ReportLinks | undefined) => void; onSent: (contact: OutreachContact | undefined, accepted: boolean) => void; editor: ReactNode }) {
  const subject = pack.subject ?? defaultOutreachSubject(pack.prospect.agency_name);
  const recipient = sender.mode === 'agency' ? pack.prospect.contact_email.trim() : sender.to;
  const recipientReady = /^[^\s@<>;,\r\n]+@[^\s@<>;,\r\n]+\.[^\s@<>;,\r\n]+$/.test(recipient);
  const [approval, setApproval] = useState<{ token: string; expiresAt: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState(0);
  const lock = useRef(false);
  const input = { pack, subject };
  // The outreach status is not part of the email: changing it (also automatically after a send) keeps the approval.
  const identity = JSON.stringify({ ...input, pack: { ...pack, status: undefined } });
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  useEffect(() => { setApproval(null); setSent(false); setMessage(''); }, [identity]);
  const canPrepare = !!pack.report?.ok && pack.reviewed && !!pack.draft.trim() && !!subject.trim();
  let preview = null, previewError = '';
  if (canPrepare) {
    try { preview = outreachEmail(input); }
    catch (e) { previewError = e instanceof Error ? e.message : 'Check the email content.'; }
  }
  const pages = preview ? [preview.html, ...preview.documents.map(d => d.html)] : [];

  async function run(send: boolean) {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage('');
    const original = identity;
    try {
      if (send && approval) {
        const result = await sendOutreachTest(input, approval.token);
        if (original !== currentIdentity.current) return;
        const history = result.contact ? (result.contact.delivery === 'accepted' ? ' Saved to the outreach history.' : ' Saved to the outreach history as unconfirmed.') : result.historyError ? ` ${result.historyError}` : '';
        if (result.state === 'accepted') { setSent(true); setMessage(`Resend accepted the email for ${recipient}. Message ID: ${result.id}. Delivery is not yet confirmed.${history}`); }
        else setMessage(`${result.error}${result.state === 'unknown' ? history : ''}`);
        if (result.state !== 'failed') onSent(result.contact, result.state === 'accepted');
      } else {
        const result = await approveOutreachTest(input);
        if (original !== currentIdentity.current) return;
        if (result.ok) { setApproval({ token: result.token, expiresAt: result.expiresAt }); setMessage('This exact subject, text, recipient and saved report links are approved for 15 minutes.'); }
        else setMessage(result.error);
      }
    } catch { setMessage('The request could not finish. Your draft is still here.'); }
    finally { lock.current = false; setPending(false); }
  }

  async function manageLinks(revoke: boolean) {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage('');
    const original = identity;
    try {
      if (revoke && pack.links) {
        const result = await revokeOutreachReports(pack.links.id);
        if (original !== currentIdentity.current) return;
        if (result.ok) onLinks(undefined); else setMessage(result.error);
      } else {
        const result = await publishOutreachReports(input);
        if (original !== currentIdentity.current) return;
        if (result.ok) onLinks(result.links); else setMessage(result.error);
      }
    } catch { setMessage('The report-link request could not finish. Your draft is still here.'); }
    finally { lock.current = false; setPending(false); }
  }

  return <div className="outreach-email">
    <p className="outreach-test-notice"><Icon name="mail" size={16} /><span><strong>{sender.mode === 'agency' ? 'Agency delivery' : 'Test delivery'}</strong> · {sender.mode === 'agency' ? 'Send requested reports to the agency contact from your CSV, after reviewing and approving the email.' : 'Only your admin address receives this email.'}</span></p>
    <div className="outreach-compose-grid"><div className="outreach-compose-settings">
    <dl className="outreach-sender"><dt>From</dt><dd>{sender.from}</dd><dt>To</dt><dd>{recipient || 'Missing contact_email in CSV'}</dd><dt>Reply-to</dt><dd>{sender.replyTo || sender.to}</dd></dl>
    <label className="field">Subject<input type="text" value={subject} maxLength={200} disabled={pending || busy} onChange={e => onSubject(e.target.value)} /></label>
    {editor}
    <div className="outreach-link-tools"><div><strong>Reports for this introduction</strong><p className="small muted">Share two report links. Recipients can view, download or save them as PDF.</p></div>
    <div className="outreach-actions">
      <button type="button" className="btn secondary" disabled={!preview || !sender.storageReady || pending || busy || !!pack.links} onClick={() => void manageLinks(false)}>Create report links</button>
      {pack.links && <button type="button" className="btn danger" disabled={pending || busy} onClick={() => void manageLinks(true)}>Revoke report links</button>}
    </div>
    {!sender.storageReady && <p className="small muted">Configure server-side report storage and apply the report-links migration to publish reports.</p>}
    {pack.links && <div className="outreach-link-status"><p>Saved links expire {pack.links.expiresAt.slice(0, 10)}. Anyone with a link can view its report.</p><a href={`${pack.links.origin}/outreach/r/${pack.links.healthToken}`} target="_blank" rel="noreferrer">Open saved health check</a><a href={`${pack.links.origin}/outreach/r/${pack.links.sampleToken}`} target="_blank" rel="noreferrer">Open saved sample report</a></div>}
    </div>
    {previewError && <p className="error" role="alert">{previewError}</p>}
    </div><div className="outreach-compose-preview">
    <div className="outreach-preview-heading"><strong>Preview</strong><span><span className="outreach-live-dot" />Updates as you write</span></div>
    {preview ? <>
      <div className="outreach-actions outreach-preview-tabs" aria-label="Email preview selection">
        {['Email', 'Health check preview', 'Sample report preview', 'Plain text'].map((label, i) => <button key={label} type="button" className={`btn ${tab === i ? '' : 'secondary'}`} aria-pressed={tab === i} onClick={() => setTab(i)}>{label}</button>)}
      </div>
      {tab === 3 ? <pre className="outreach-text-preview">{preview.text}</pre> : <iframe sandbox="" referrerPolicy="no-referrer" title={['Outreach email preview', 'Health check document preview', 'Sample report document preview'][tab]} srcDoc={pages[tab]} className="outreach-email-preview" />}
    </> : <div className="outreach-preview-empty"><Icon name="report" size={30} /><strong>A preview worth sending.</strong><p>Prepare a health check and write your introduction. Your email and both reports will appear here.</p></div>}
    </div></div>
    <div className="outreach-send-panel">
    {!sender.ready && <p className="small muted">{sender.reason}</p>}
    {!recipientReady && <p className="error" role="alert">Add a valid contact_email for this agency before approving or sending.</p>}
    {previous && !sent && <p className="outreach-previous" role="note"><Icon name="alert" size={16} /><span><strong>Already contacted on {contactDay(previous.sent_at, timeZone)}</strong> ({previous.contact_email}). Sending again adds a follow-up to the outreach history.</span></p>}
    <p className="outreach-recipient-confirmation">Recipient: <strong>{recipient || 'Not supplied'}</strong></p>
    <div className="outreach-actions">
      <button type="button" className="btn secondary" disabled={!sender.ready || !recipientReady || !preview || !pack.links || pending || busy || sent} onClick={() => void run(false)}>{pending ? 'Working…' : approval ? 'Renew approval' : 'Approve email'}</button>
      <button type="button" className="btn" disabled={!sender.ready || !recipientReady || !approval || pending || busy || sent} onClick={() => void run(true)}><Icon name={sent ? 'check' : 'mail'} size={16} />{sent ? 'Accepted by Resend' : 'Send approved email'}</button>
    </div>
    {message && <p role="status" aria-live="polite">{message}</p>}
    <p className="small muted">Review the recipient before sending. Editing the recipient, subject, introduction or reports requires fresh approval.</p>
    </div>
  </div>;
}
