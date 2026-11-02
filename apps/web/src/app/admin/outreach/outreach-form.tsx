'use client';

import { useEffect, useRef, useState } from 'react';
import { DEFAULT_SECTIONS } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { CopyButton } from '@/components/copy-button';
import { COLUMNS, draftMessage, ensureUnique, exportCsv, newPack, parseCsv, restorePacks, serializePacks, validateProspect, type Pack } from '@/lib/outreach';
import { SAMPLE_NOTICE, sampleMonthReport } from '@/lib/sample-month-report';
import { quickReport } from '../actions';
import { EmailComposer, type TestSenderInfo } from './email-composer';

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OutreachForm({ sender }: { sender: TestSenderInfo }) {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<'health' | 'sample'>('health');
  const running = useRef(false);
  const stop = useRef(false);
  const current = packs[active];
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
    setPacks(prev => prev.map((p, i) => i === index ? { ...p, ...changes, ...('report' in changes ? { links: undefined } : {}) } : p)); setDirty(true);
  }

  async function importFile(file: File | undefined, backup: boolean) {
    if (!file) return;
    try {
      if (file.size > (backup ? 5_000_000 : 500_000)) throw new Error('File is too large.');
      const source = await file.text();
      const incoming = backup ? restorePacks(source) : parseCsv(source);
      setPacks(ensureUnique([...packs, ...incoming])); setDirty(true); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Import failed.'); }
  }

  async function prepare(indices: number[]) {
    if (running.current) return;
    running.current = true; stop.current = false; setBusy(true); setError('');
    try {
      for (const [n, index] of indices.entries()) {
        if (stop.current) break;
        const p = packs[index];
        if (!p.reviewed || p.links || ['contacted', 'replied', 'declined'].includes(p.status)) continue;
        setProgress(`${n + 1} of ${indices.length}: ${p.prospect.agency_name}`);
        const form = new FormData(); form.set('url', p.prospect.client_store_url); form.set('preparedBy', 'StoreCareHQ');
        try {
          const result = await quickReport(null, form);
          if (!result) throw new Error('The check returned no result.');
          const report = result.report;
          update(index, { report, preparedAt: new Date().toISOString(), status: report.ok ? 'prepared' : 'new', ...(p.draft ? {} : { draft: draftMessage(p.prospect, report) }) });
        } catch { update(index, { report: { ok: false, error: 'The check could not finish. Try again.' } }); }
      }
    } finally { running.current = false; setBusy(false); setProgress(''); }
  }

  const eligible = packs.map((p, i) => p.reviewed && !p.links && !p.report?.ok && p.status === 'new' ? i : -1).filter(i => i >= 0).slice(0, 20);
  const sample = current ? sampleMonthReport(current.prospect.agency_name, current.preparedAt || new Date().toISOString()) : null;

  return <>
    <section className="card no-print outreach-import">
      <div><h2>01 / Add agencies</h2><p className="small muted">Import reviewed leads from the Shopify directory. Files stay in this tab until you export. Email testing sends only to your signed-in admin address after approval.</p></div>
      <div className="outreach-actions">
        <label className="field">Agency CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { void importFile(e.target.files?.[0], false); e.target.value = ''; }} /></label>
        <label className="field">Restore JSON backup<input type="file" accept=".json,application/json" disabled={busy} onChange={e => { void importFile(e.target.files?.[0], true); e.target.value = ''; }} /></label>
        <button className="btn secondary" onClick={() => download('agency-template.csv', COLUMNS.join(',') + '\r\n', 'text/csv')}>Download CSV template</button>
      </div>
      <details><summary>Add one agency manually</summary>
        <form className="outreach-fields" onSubmit={e => {
          e.preventDefault(); const form = e.currentTarget;
          try { const p = validateProspect(Object.fromEntries(new FormData(form))); setPacks(ensureUnique([...packs, newPack(p)])); setDirty(true); setError(''); form.reset(); }
          catch (err) { setError(err instanceof Error ? err.message : 'Check the agency details.'); }
        }}>
          {COLUMNS.map(key => <label className="field" key={key}>{key.replaceAll('_', ' ')}<input name={key} disabled={busy} required={['agency_name', 'agency_url', 'client_store_url', 'portfolio_source_url'].includes(key)} type={key === 'contact_email' ? 'email' : 'text'} maxLength={key.endsWith('_url') ? 300 : 120} /></label>)}
          <button disabled={busy} className="btn">Add agency</button>
        </form>
      </details>
      {error && <p className="error" role="alert">{error}</p>}
    </section>

    {packs.length > 0 && <>
      <div className="outreach-toolbar no-print">
        <p><strong>{packs.length}</strong> agencies · <strong>{packs.filter(p => p.report?.ok).length}</strong> health checks ready</p>
        <div className="outreach-actions">
          <button className="btn" disabled={busy || !eligible.length} onClick={() => void prepare(eligible)}>Prepare reviewed agencies ({eligible.length})</button>
          {busy && <button className="btn secondary" onClick={() => { stop.current = true; }}>Stop after current check</button>}
          <button className="btn secondary" disabled={busy} onClick={() => { download('storecare-outreach.json', serializePacks(packs), 'application/json'); setDirty(false); }}>Export backup{dirty ? ' *' : ''}</button>
          <button className="btn secondary" onClick={() => download('storecare-outreach.csv', exportCsv(packs), 'text/csv')}>Export CSV summary</button>
        </div>
        <p role="status" aria-live="polite">{busy ? `Checking ${progress}. Each check may take a minute.` : 'Review portfolio matches below, then prepare up to 20 at a time.'}</p>
      </div>
      <div className="outreach-workspace">
        <aside className="outreach-list no-print" aria-label="Agency list">
          {packs.map((p, i) => <button key={p.prospect.agency_url} className={active === i ? 'is-active' : ''} aria-pressed={active === i} onClick={() => setActive(i)}><strong>{p.prospect.agency_name}</strong><span>{p.report && !p.report.ok ? 'Check failed — retry available' : p.status}{p.reviewed ? ' · reviewed' : ' · needs review'}</span></button>)}
        </aside>
        {current && <div className="outreach-detail">
          <section className="card no-print">
            <h2>02 / {current.prospect.agency_name}</h2>
            <div className="outreach-actions">
              <a href={current.prospect.agency_url} target="_blank" rel="noreferrer">Agency website ↗</a>
              <a href={current.prospect.portfolio_source_url} target="_blank" rel="noreferrer">Portfolio evidence ↗</a>
              <a href={current.prospect.client_store_url} target="_blank" rel="noreferrer">Client store ↗</a>
              {current.prospect.directory_url && <a href={current.prospect.directory_url} target="_blank" rel="noreferrer">Directory profile ↗</a>}
            </div>
            <p className="small muted">{current.prospect.contact_name || 'Contact not supplied'} · {current.prospect.contact_email || 'Email not supplied'}</p>
            <label className="outreach-review"><input type="checkbox" disabled={busy} checked={current.reviewed} onChange={e => update(active, { reviewed: e.target.checked })} />I checked the portfolio source and store match. This does not confirm an ongoing client relationship.</label>
            <div className="outreach-actions">
              <button className="btn" disabled={busy || !current.reviewed || !!current.links || ['contacted', 'replied', 'declined'].includes(current.status)} onClick={() => void prepare([active])}>{current.report?.ok ? 'Refresh health check' : 'Prepare this agency'}</button>
              <label className="field">Outreach status<select disabled={busy} value={current.status} onChange={e => update(active, { status: e.target.value as Pack['status'] })}>{['new', 'prepared', 'contacted', 'replied', 'declined'].map(s => <option key={s}>{s}</option>)}</select></label>
            </div>
            <p className="small muted">Public storefront checks only. No recurring monitoring or checkout test is enabled.</p>
            {current.links && <p className="small muted">Revoke the saved report links in the email preview before refreshing this health check.</p>}
          </section>
          <section className="card no-print">
            <h2>03 / Personal introduction</h2>
            <p className="small muted">Edit the introduction below, then preview and approve a test to your own address. Existing edits are kept when you refresh a check.</p>
            <div className="field"><label htmlFor="outreach-draft">Email draft</label><textarea id="outreach-draft" rows={13} disabled={busy} value={current.draft} onChange={e => update(active, { draft: e.target.value })} maxLength={20000} /></div>
            <div className="outreach-actions"><CopyButton text={current.draft} label="Copy email draft" />
              <button className="btn secondary" disabled={!current.report?.ok} onClick={() => { if (current.report && (!current.draft || window.confirm('Replace your edited draft with a fresh draft from the current check?'))) update(active, { draft: draftMessage(current.prospect, current.report) }); }}>Regenerate draft</button>
            </div>
            <EmailComposer key={current.prospect.agency_url} pack={current} sender={sender} busy={busy} onSubject={subject => update(active, { subject })} onLinks={links => update(active, { links })} />
          </section>
          <div className="outreach-actions no-print">
            <button className={`btn ${view === 'health' ? '' : 'secondary'}`} aria-pressed={view === 'health'} onClick={() => setView('health')}>Current health check</button>
            <button className={`btn ${view === 'sample' ? '' : 'secondary'}`} aria-pressed={view === 'sample'} onClick={() => setView('sample')}>Sample monthly report</button>
            <button className="btn secondary" disabled={view === 'health' && !current.report?.ok} onClick={() => window.print()}>Print / save selected report as PDF</button>
          </div>
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
        </div>}
      </div>
    </>}
  </>;
}
