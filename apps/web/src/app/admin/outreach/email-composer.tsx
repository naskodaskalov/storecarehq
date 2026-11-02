'use client';

import { useEffect, useRef, useState } from 'react';
import { defaultOutreachSubject, outreachEmail } from '@/lib/outreach-email';
import type { Pack, ReportLinks } from '@/lib/outreach';
import { approveOutreachTest, sendOutreachTest, publishOutreachReports, revokeOutreachReports } from './actions';

export type TestSenderInfo = { from: string; to: string; ready: boolean; storageReady: boolean; reason: string };

export function EmailComposer({ pack, sender, busy, onSubject, onLinks }: { pack: Pack; sender: TestSenderInfo; busy: boolean; onSubject: (value: string) => void; onLinks: (value: ReportLinks | undefined) => void }) {
  const subject = pack.subject ?? defaultOutreachSubject(pack.prospect.agency_name);
  const [approval, setApproval] = useState<{ token: string; expiresAt: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [sent, setSent] = useState(false);
  const [tab, setTab] = useState(0);
  const lock = useRef(false);
  const input = { pack, subject };
  const identity = JSON.stringify(input);
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
        if (result.state === 'accepted') { setSent(true); setMessage(`Resend accepted the test for ${sender.to}. Message ID: ${result.id}. Delivery is not yet confirmed.`); }
        else setMessage(result.error);
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
    <h3>Email preview &amp; test delivery</h3>
    <p className="outreach-test-notice"><strong>Test mode</strong> · Sends only to your signed-in admin address. The agency is never a recipient.</p>
    <dl className="outreach-sender"><dt>From</dt><dd>{sender.from}</dd><dt>Test recipient / reply-to</dt><dd>{sender.to}</dd><dt>Future agency recipient</dt><dd>{pack.prospect.contact_email || 'Not supplied'}</dd></dl>
    <label className="field">Subject<input type="text" value={subject} maxLength={200} disabled={pending || busy} onChange={e => onSubject(e.target.value)} /></label>
    <p className="small muted">The email contains two report links and no attachments. Create the links before approving. Each report can be viewed, downloaded as HTML or saved as PDF using the browser’s print dialog.</p>
    <div className="outreach-actions">
      <button type="button" className="btn secondary" disabled={!preview || !sender.storageReady || pending || busy || !!pack.links} onClick={() => void manageLinks(false)}>Create report links</button>
      {pack.links && <button type="button" className="btn secondary" disabled={pending || busy} onClick={() => void manageLinks(true)}>Revoke report links</button>}
    </div>
    {!sender.storageReady && <p className="small muted">Configure server-side report storage and apply the report-links migration to publish reports.</p>}
    {pack.links && <div className="outreach-link-status"><p>Saved links expire {pack.links.expiresAt.slice(0, 10)}. Anyone with a link can view its report.</p><a href={`${pack.links.origin}/outreach/r/${pack.links.healthToken}`} target="_blank" rel="noreferrer">Open saved health check</a><a href={`${pack.links.origin}/outreach/r/${pack.links.sampleToken}`} target="_blank" rel="noreferrer">Open saved sample report</a></div>}
    {previewError && <p className="error" role="alert">{previewError}</p>}
    {preview ? <>
      <div className="outreach-actions" aria-label="Email preview selection">
        {['Email', 'Health check preview', 'Sample report preview', 'Plain text'].map((label, i) => <button key={label} type="button" className={`btn ${tab === i ? '' : 'secondary'}`} aria-pressed={tab === i} onClick={() => setTab(i)}>{label}</button>)}
      </div>
      {tab === 3 ? <pre className="outreach-text-preview">{preview.text}</pre> : <iframe sandbox="" referrerPolicy="no-referrer" title={['Outreach email preview', 'Health check document preview', 'Sample report document preview'][tab]} srcDoc={pages[tab]} className="outreach-email-preview" />}
    </> : <p className="small muted">Prepare a reviewed health check and write an introduction to preview the email and reports.</p>}
    {!sender.ready && <p className="small muted">{sender.reason}</p>}
    <div className="outreach-actions">
      <button type="button" className="btn secondary" disabled={!sender.ready || !preview || !pack.links || pending || busy || sent} onClick={() => void run(false)}>{pending ? 'Working…' : approval ? 'Renew approval' : 'Approve test email'}</button>
      <button type="button" className="btn" disabled={!sender.ready || !approval || pending || busy || sent} onClick={() => void run(true)}>{sent ? 'Test accepted by Resend' : 'Send approved test email'}</button>
    </div>
    {message && <p role="status" aria-live="polite">{message}</p>}
    <p className="small muted">Editing the subject, introduction or reports clears approval. A test send does not mark the agency as contacted.</p>
  </div>;
}
