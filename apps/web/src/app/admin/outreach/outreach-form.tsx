'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SECTIONS } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { CopyButton } from '@/components/copy-button';
import { COLUMNS, draftMessage, exportCsv, newPack, parseCsv, restorePacks, serializePacks, validateProspect, type Pack } from '@/lib/outreach';
import { SAMPLE_NOTICE, sampleMonthReport } from '@/lib/sample-month-report';
import { quickReport } from '../actions';
import { addOutreachLeads, removeOutreachLead, updateOutreachLead } from './actions';
import { LEAD_SOURCES, leadPack, mergeBackup, outcomeSummary, type OutreachLead } from '@/lib/outreach-leads';
import { agencyDomain } from '@/lib/outreach-history';
import { BfcmOnePager } from '@/components/bfcm-one-pager';
import { validAudit } from '@/lib/bfcm';
import { EmailComposer, type TestSenderInfo } from './email-composer';
import { OutreachHistory } from './outreach-history';
import { contactDay, previousContacts, type OutreachContact } from '@/lib/outreach-history';
import { Icon } from '@/components/icon';

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const savedKeys = new Set(['reviewed', 'status']);
const OPEN = ['new', 'prepared'];

/** Adds packs not already in the list (by agency website), keeping the list's own copy of any repeat. */
function withoutRepeats(current: Pack[], incoming: Pack[]): Pack[] {
  const seen = new Set(current.map(p => agencyDomain(p.prospect.agency_url)));
  return [...current, ...incoming.filter(p => { const d = agencyDomain(p.prospect.agency_url); if (seen.has(d)) return false; seen.add(d); return true; })];
}

export function OutreachForm({ sender, history, historyError, leads, leadsError, timeZone }: { sender: TestSenderInfo; history: OutreachContact[]; historyError: string | null; leads: OutreachLead[]; leadsError: string | null; timeZone: string }) {
  const [packs, setPacks] = useState<Pack[]>(() => leads.map(leadPack));
  const [leadInfo, setLeadInfo] = useState(() => new Map(leads.map(l => [l.id, l])));
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [contacts, setContacts] = useState(history);
  const [active, setActive] = useState(() => Math.max(0, leads.findIndex(l => OPEN.includes(l.status))));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState<number | null>(null);
  const [queued, setQueued] = useState<number[]>([]);
  const [progress, setProgress] = useState('');
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'health' | 'sample'>('health');
  const running = useRef(false);
  const stop = useRef(false);
  const current = packs[active];
  const contactedBefore = (p: Pack) => previousContacts(p.prospect, contacts);
  const currentPrevious = current ? contactedBefore(current) : [];
  const currentLoading = queued.includes(active);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    const navigate = (e: MouseEvent) => {
      if (!dirty || !(e.target instanceof Element) || !e.target.closest('a[href]')) return;
      if (!window.confirm('Your changes are only in this tab. Leave without exporting a backup?')) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', navigate, true); };
  }, [dirty]);

  function update(index: number, changes: Partial<Pack>) {
    setPacks(prev => prev.map((p, i) => i === index ? { ...p, ...changes, ...('report' in changes ? { links: undefined } : {}) } : p));
    if (Object.keys(changes).some(k => !savedKeys.has(k))) setDirty(true);
    const leadId = packs[index]?.leadId;
    const saved = Object.fromEntries(Object.entries(changes).filter(([k]) => savedKeys.has(k)));
    if (leadId && Object.keys(saved).length) void updateOutreachLead(leadId, saved).then(r => { if (!r.ok) setError(r.error); });
  }

  /** Saves new agencies to the lead list and adds the saved ones to the workspace. Repeats and agencies already
   *  emailed are skipped. If saving fails, they are added to this tab only, as before. */
  async function saveNew(incoming: Pack[], source: 'csv' | 'manual' | 'backup'): Promise<boolean> {
    const result = await addOutreachLeads(incoming.map(p => p.prospect), source);
    if (!result.ok) {
      setPacks(prev => withoutRepeats(prev, incoming)); setDirty(true);
      setError(`${result.error} They were added to this tab only, so export a backup to keep them.`); return false;
    }
    const byId = new Map(result.added.map(l => [l.id, l]));
    const fresh = result.outcomes.flatMap((o, i) => {
      const lead = o.lead_id ? byId.get(o.lead_id) : undefined;
      if (!lead) return [];
      const from = incoming[i], pack = { ...from, ...leadPack(lead), report: from.report, draft: from.draft, preparedAt: from.preparedAt, ...(from.subject !== undefined ? { subject: from.subject } : {}), ...(from.links ? { links: from.links } : {}) };
      if (from.reviewed || from.status !== 'new') { pack.reviewed = from.reviewed; pack.status = from.status; void updateOutreachLead(lead.id, { reviewed: from.reviewed, status: from.status }).then(r => { if (!r.ok) setError(r.error); }); }
      return [pack];
    });
    setLeadInfo(prev => new Map([...prev, ...result.added.map(l => [l.id, l] as const)]));
    setPacks(prev => withoutRepeats(prev, fresh)); setNotice(outcomeSummary(result.outcomes)); return true;
  }

  async function remove(index: number) {
    const p = packs[index];
    if (!p || !window.confirm(`Remove ${p.prospect.agency_name} from the list?${p.leadId ? ' It is deleted from the saved leads too.' : ''}`)) return;
    if (p.leadId) { const r = await removeOutreachLead(p.leadId); if (!r.ok) { setError(r.error); return; } }
    setPacks(prev => prev.filter((_, i) => i !== index)); setActive(a => Math.max(0, a > index ? a - 1 : Math.min(a, packs.length - 2)));
  }

  async function importFile(file: File | undefined, backup: boolean) {
    if (!file) return;
    try {
      if (file.size > (backup ? 5_000_000 : 500_000)) throw new Error('File is too large.');
      const source = await file.text();
      setError(''); setNotice('');
      if (!backup) { await saveNew(parseCsv(source), 'csv'); return; }
      const merged = mergeBackup(packs, restorePacks(source));
      setPacks(merged.packs); setDirty(true);
      for (const p of merged.changed) void updateOutreachLead(p.leadId!, { reviewed: p.reviewed, status: p.status }).then(r => { if (!r.ok) setError(r.error); });
      if (merged.unsaved.length) await saveNew(merged.unsaved, 'backup');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
  }

  async function prepare(indices: number[]) {
    if (running.current) return;
    indices = indices.filter(index => packs[index].reviewed && !packs[index].links && !['contacted', 'replied', 'declined'].includes(packs[index].status));
    if (!indices.length) return;
    running.current = true; stop.current = false; setBusy(true); setError('');
    setQueued(indices);
    try {
      for (const [n, index] of indices.entries()) {
        if (stop.current) break;
        const p = packs[index];
        setPreparing(index);
        setProgress(`${n + 1} of ${indices.length}: ${p.prospect.agency_name}`);
        const form = new FormData(); form.set('url', p.prospect.client_store_url); form.set('preparedBy', 'StoreCareHQ');
        try {
          const result = await quickReport(null, form);
          if (!result) throw new Error('The check returned no result.');
          const report = result.report;
          update(index, { report, preparedAt: new Date().toISOString(), status: report.ok ? 'prepared' : 'new', ...(p.draft ? {} : { draft: draftMessage(p.prospect, report) }) });
        } catch { update(index, { report: { ok: false, error: 'The check could not finish. Try again.' } }); }
        finally { setQueued(remaining => remaining.filter(i => i !== index)); }
      }
    } finally { running.current = false; setBusy(false); setPreparing(null); setQueued([]); setProgress(''); }
  }

  // Batch preparation skips agencies in the outreach history; prepare one of those on purpose with its own button.
  const eligible = packs.map((p, i) => p.reviewed && !p.links && !p.report?.ok && p.status === 'new' && !contactedBefore(p).length ? i : -1).filter(i => i >= 0).slice(0, 20);
  const sample = current ? sampleMonthReport(current.prospect.agency_name, current.preparedAt || new Date().toISOString()) : null;

  return <>
    <details className="card no-print outreach-import" open={packs.length === 0 || undefined}>
      <summary className="outreach-import-heading"><span className="outreach-step"><Icon name="plus" size={19} /></span><span><strong>Add agencies</strong><span className="small muted">Import a list or add your next prospect by hand.</span></span><Icon name="chevron" size={17} /></summary>
      <div className="outreach-import-content"><div className="outreach-upload-grid">
        <label className="field">Agency CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { void importFile(e.target.files?.[0], false); e.target.value = ''; }} /></label>
        <label className="field">Restore JSON backup<input type="file" accept=".json,application/json" disabled={busy} onChange={e => { void importFile(e.target.files?.[0], true); e.target.value = ''; }} /></label>
        <button className="btn secondary" onClick={() => download('agency-template.csv', COLUMNS.join(',') + '\r\n', 'text/csv')}>Download CSV template</button>
      </div>
      <details><summary>Add one agency manually</summary>
        <form className="outreach-fields" onSubmit={e => {
          e.preventDefault(); const form = e.currentTarget;
          let p;
          try { p = validateProspect(Object.fromEntries(new FormData(form))); }
          catch (err) { setError(err instanceof Error ? err.message : 'Check the agency details.'); return; }
          setError(''); setNotice('');
          void saveNew([newPack(p)], 'manual').then(ok => { if (ok) form.reset(); });
        }}>
          {COLUMNS.map(key => <label className="field" key={key}>{{ agency_name: 'Agency name', agency_url: 'Agency website', directory_url: 'Directory profile (optional)', contact_name: 'Contact name (optional)', contact_email: 'Contact email (optional)', client_store_url: 'Client store website', portfolio_source_url: 'Portfolio reference' }[key]}<input name={key} placeholder={key.endsWith('_url') ? 'https://…' : key === 'contact_email' ? 'hello@agency.com' : undefined} disabled={busy} required={['agency_name', 'agency_url', 'client_store_url', 'portfolio_source_url'].includes(key)} type={key === 'contact_email' ? 'email' : 'text'} maxLength={key.endsWith('_url') ? 300 : 120} /></label>)}
          <button disabled={busy} className="btn">Add agency</button>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
      {notice && <p className="small" role="status">{notice}</p>}
      {leadsError && <p className="error" role="alert">{leadsError}</p>}
      <p className="small muted outreach-storage-note"><Icon name="clock" size={14} />Agencies, their review and status are saved, including leads from the daily research. Health checks and drafts stay in this tab, so export a backup to keep them. Sent emails are saved to the outreach history.</p></div>
    </details>

    <OutreachHistory contacts={contacts} error={historyError} timeZone={timeZone} />

    {packs.length === 0 && <section className="outreach-empty no-print"><span className="outreach-empty-icon"><Icon name="mail" size={28} /></span><h2>Your next conversation starts here.</h2><p>Add an agency, check a store from its portfolio, and turn the findings into a personal introduction.</p><div className="outreach-empty-steps"><span>01 <strong>Add an agency</strong></span><Icon name="arrow" size={16} /><span>02 <strong>Prepare a report</strong></span><Icon name="arrow" size={16} /><span>03 <strong>Send an email</strong></span></div></section>}

    {packs.length > 0 && <>
      <div className="outreach-toolbar no-print">
        <div className="outreach-stats"><div><span>Agencies</span><strong>{String(packs.length).padStart(2, '0')}</strong></div><div><span>Health checks ready</span><strong>{String(packs.filter((p, i) => p.report?.ok && !queued.includes(i)).length).padStart(2, '0')}</strong></div><div><span>Report links created</span><strong>{String(packs.filter(p => p.links).length).padStart(2, '0')}</strong></div></div>
        <div className="outreach-actions">
          <button className="btn" disabled={busy || !eligible.length} onClick={() => void prepare(eligible)}>Prepare reviewed agencies ({eligible.length})</button>
          {busy && <button className="btn secondary" onClick={() => { stop.current = true; }}>Stop after current check</button>}
          <button className="btn secondary" disabled={busy} onClick={() => { download('storecare-outreach.json', serializePacks(packs), 'application/json'); setDirty(false); }}>Export backup{dirty ? ' *' : ''}</button>
          <button className="btn secondary" onClick={() => download('storecare-outreach.csv', exportCsv(packs), 'text/csv')}>Export CSV summary</button>
        </div>
        <p className="outreach-progress" role="status" aria-live="polite">{busy ? `Checking ${progress}. Each check may take a minute.` : 'Review a portfolio match, prepare the report, then write your introduction.'}</p>
      </div>
      <div className="outreach-workspace">
        <aside className="outreach-list no-print" aria-label="Agency list">
          <div className="outreach-list-caption">YOUR AGENCIES <span>{packs.length}</span></div>
          <label className="outreach-list-filter small"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />Show contacted, replied and declined</label>
          {packs.map((p, i) => (showAll || OPEN.includes(p.status) || i === active) && <button key={p.prospect.agency_url} className={active === i ? 'is-active' : ''} aria-pressed={active === i} onClick={() => setActive(i)}><span className="outreach-agency-avatar" aria-hidden="true">{p.prospect.agency_name.slice(0, 1).toUpperCase()}</span><span className="outreach-agency-copy"><strong>{p.prospect.agency_name}</strong><span className="outreach-agency-domain">{new URL(p.prospect.agency_url).hostname.replace(/^www\./, '')}</span><span className={`outreach-status ${p.report?.ok && !queued.includes(i) ? 'is-ready' : ''}`}>{queued.includes(i) ? (preparing === i ? 'Preparing reports…' : 'Queued for preparation') : p.report && !p.report.ok ? 'Check failed — retry available' : p.status}{p.reviewed ? ' · reviewed' : ' · needs review'}</span>{(() => { const last = contactedBefore(p)[0]; return last && <span className="outreach-contacted"><Icon name="mail" size={11} />Contacted {contactDay(last.sent_at, timeZone)}</span>; })()}</span></button>)}
        </aside>
        {current && <div className="outreach-detail">
          <section className="card no-print outreach-agency-card">
            <div className="outreach-section-heading"><span className="outreach-step">01</span><div><p className="outreach-eyebrow">REVIEW THE MATCH</p><h2>{current.prospect.agency_name}</h2></div></div>
            <div className="outreach-actions outreach-source-links">
              <a href={current.prospect.agency_url} target="_blank" rel="noreferrer">Agency website ↗</a>
              <a href={current.prospect.portfolio_source_url} target="_blank" rel="noreferrer">Portfolio evidence ↗</a>
              <a href={current.prospect.client_store_url} target="_blank" rel="noreferrer">Client store ↗</a>
              {current.prospect.directory_url && <a href={current.prospect.directory_url} target="_blank" rel="noreferrer">Directory profile ↗</a>}
            </div>
            <p className="small muted">{current.prospect.contact_name || 'Contact not supplied'} · {current.prospect.contact_email || 'Email not supplied'}</p>
            {(() => { const lead = current.leadId ? leadInfo.get(current.leadId) : undefined; return <p className="small muted">{current.fitNote && <><span className="outreach-fit">Why it fits: {current.fitNote}</span><br /></>}{lead ? `${LEAD_SOURCES[lead.source]} · added ${contactDay(lead.created_at, timeZone)}` : 'Not saved: this agency is only in this tab.'}</p>; })()}
            {currentPrevious.length > 0 && <div className="outreach-previous" role="note"><Icon name="alert" size={16} /><div>
              <strong>Already contacted {currentPrevious.length === 1 ? 'once' : `${currentPrevious.length} times`}</strong>
              <ul>{currentPrevious.slice(0, 3).map(c => <li key={c.id}>{contactDay(c.sent_at, timeZone)} · {c.contact_email} · “{c.subject}”{c.delivery === 'unconfirmed' ? ' · unconfirmed' : ''}{c.sent_by !== sender.to ? ` · by ${c.sent_by}` : ''}</li>)}</ul>
            </div></div>}
            <label className="outreach-review"><input type="checkbox" disabled={busy} checked={current.reviewed} onChange={e => update(active, { reviewed: e.target.checked })} />I checked the portfolio source and store match. This does not confirm an ongoing client relationship.</label>
            <div className="outreach-actions">
              <button className="btn" disabled={busy || !current.reviewed || !!current.links || ['contacted', 'replied', 'declined'].includes(current.status)} aria-busy={currentLoading} onClick={() => void prepare([active])}>{currentLoading ? <><span className="spinner" aria-hidden="true" />{preparing === active ? 'Preparing reports…' : 'Queued…'}</> : current.report?.ok ? 'Refresh health check' : 'Prepare this agency'}</button>
              <button className="btn secondary" disabled={busy} onClick={() => void remove(active)}>Remove from list</button>
              <label className="field">Outreach status<select disabled={busy} value={current.status} onChange={e => update(active, { status: e.target.value as Pack['status'] })}>{['new', 'prepared', 'contacted', 'replied', 'declined'].map(s => <option key={s}>{s}</option>)}</select></label>
            </div>
            <p className="small muted">Public storefront checks only. No recurring monitoring or checkout test is enabled.</p>
            {current.links && <p className="small muted">Revoke the saved report links in the email preview before refreshing this health check.</p>}
          </section>
          {currentLoading && <div className="outreach-preparing no-print" role="status" aria-live="polite">
            <section className="card outreach-loading-panel">
              <div className="outreach-section-heading"><span className="outreach-step"><span className="spinner" aria-hidden="true" /></span><div><p className="outreach-eyebrow">{preparing === active ? 'CHECKING THE STOREFRONT' : 'IN THE QUEUE'}</p><h2>{preparing === active ? `Preparing reports for ${current.prospect.agency_name}` : `Waiting to prepare ${current.prospect.agency_name}`}</h2></div></div>
              <p className="small muted">{preparing === active ? 'Running the public store checks. Your introduction and report previews will be available when this finishes. This can take about a minute.' : 'Another agency is being checked first. Your reports will start automatically when its check finishes.'}</p>
              <div className="outreach-loading-grid" aria-hidden="true"><div><div className="skeleton outreach-loading-label" /><div className="skeleton outreach-loading-field" /><div className="skeleton outreach-loading-label" /><div className="skeleton outreach-loading-message" /></div><div className="skeleton outreach-loading-preview" /></div>
            </section>
            <section className="card outreach-loading-report" aria-hidden="true"><div className="skeleton outreach-loading-label" /><div className="skeleton outreach-loading-field" /><div className="skeleton outreach-loading-field" /></section>
          </div>}
          <div className="outreach-dependent-content" hidden={currentLoading} inert={currentLoading}>
          <section className="card no-print outreach-compose-card">
            <div className="outreach-section-heading"><span className="outreach-step">02</span><div><p className="outreach-eyebrow">MAKE IT PERSONAL</p><h2>Your introduction</h2></div></div>
            <EmailComposer key={current.prospect.agency_url} pack={current} sender={sender} busy={currentLoading} previous={currentPrevious[0] ?? null} timeZone={timeZone} onSubject={subject => update(active, { subject })} onLinks={links => update(active, { links })}
              onSent={(contact, accepted) => { if (contact) setContacts(prev => [contact, ...prev.filter(c => c.id !== contact.id)]); if (accepted) update(active, { status: 'contacted' }); }} editor={<>
            <div className="field"><label htmlFor="outreach-draft">Email draft</label><textarea id="outreach-draft" rows={13} disabled={currentLoading} value={current.draft} onChange={e => update(active, { draft: e.target.value })} maxLength={20000} /></div>
            <div className="outreach-actions"><CopyButton text={current.draft} label="Copy email draft" />
              <button className="btn secondary" disabled={currentLoading || !current.report?.ok} onClick={() => { if (current.report && (!current.draft || window.confirm('Replace your edited draft with a fresh draft from the current check?'))) update(active, { draft: draftMessage(current.prospect, current.report) }); }}>Regenerate draft</button>
            </div>
            </>} />
          </section>
          <div className="outreach-actions outreach-report-tabs no-print">
            <button className={`btn ${view === 'health' ? '' : 'secondary'}`} aria-pressed={view === 'health'} onClick={() => setView('health')}>Current health check</button>
            <button className={`btn ${view === 'sample' ? '' : 'secondary'}`} aria-pressed={view === 'sample'} onClick={() => setView('sample')}>Sample monthly report</button>
            <button className="btn secondary" disabled={view === 'health' && !current.report?.ok} onClick={() => window.print()}>Print / save selected report as PDF</button>
          </div>
          {view === 'health' && current.report?.ok && current.report.bfcm && validAudit(current.report.bfcm) && <div className="outreach-print"><BfcmOnePager audit={current.report.bfcm} brand={{ name: 'StoreCare HQ', brandColor: '#2747A8' }} preparedFor={current.prospect.agency_name} embedded /></div>}
          {view === 'health' && (current.report?.ok ? <article className="card outreach-print">
            <p className="small muted">StoreCareHQ · current public storefront snapshot</p>
            <h2>{current.report.host}</h2><p>Checked: {current.report.checkedAt}</p>
            <p>Prepared for {current.prospect.agency_name}. One outside look; no historical monitoring or full checkout test. Unavailable checks require verification.</p>
            {current.report.sections.map(section => <section key={section.title}><h3>{section.title}</h3><ul>{section.items.map((item, i) => <li key={i}>{item.text}</li>)}</ul></section>)}
          </article> : <p className="card no-print" role="status">{current.report && !current.report.ok ? current.report.error : 'Review this agency and prepare a health check to see real findings.'}</p>)}
          {view === 'sample' && sample && <section className="outreach-print outreach-sample">
            <p className="outreach-sample-notice">{SAMPLE_NOTICE}</p>
            <ReportView facts={sample.facts} summary={sample.summary} sections={DEFAULT_SECTIONS} />
            <p className="outreach-sample-notice">{SAMPLE_NOTICE}</p>
          </section>}
          </div>
        </div>}
      </div>
    </>}
  </>;
}
