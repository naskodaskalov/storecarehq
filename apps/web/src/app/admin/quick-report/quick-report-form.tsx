'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { CopyButton } from '@/components/copy-button';
import { quickReport, type QuickReportState } from '../actions';
import { Icon } from '@/components/icon';

export function QuickReportForm() {
  const [state, action, pending] = useActionState<QuickReportState, FormData>(quickReport, null);
  const report = state?.report;

  return (
    <>
      <form action={action} className="card admin-form no-print">
        <div className="quick-form-heading"><span className="quick-form-icon"><Icon name="search" size={20} /></span><div><h2>Check a storefront</h2><p>Public checks only. No store access or workspace setup needed.</p></div></div>
        <div className="admin-form-row">
          <label className="field quick-url-field">
            <span>Store address</span>
            <input type="text" name="url" required placeholder="clientstore.com" defaultValue={state?.input ?? ''} autoComplete="off" autoCapitalize="none" spellCheck={false} />
          </label>
          <label className="field quick-agency-field">
            <span>Prepared by (optional)</span>
            <input type="text" name="preparedBy" placeholder="Your agency name" defaultValue={state?.preparedBy ?? ''} />
          </label>
        </div>
        <div className="quick-form-actions">
          <SubmitButton pending={pending} pendingText="Checking the store… up to a minute"><Icon name="search" size={16} />Run report</SubmitButton>
          <span className="small muted"><Icon name="clock" size={14} />Usually ready within a minute</span>
        </div>
        <div className="quick-coverage"><span>Checks include</span><span><Icon name="clock" size={14} />Speed</span><span><Icon name="check" size={14} />SSL &amp; domain</span><span><Icon name="report" size={14} />Links</span><span><Icon name="store" size={14} />Theme, apps &amp; products</span><span><Icon name="billing" size={14} />Cart</span></div>
      </form>

      {!report && !pending && <section className="quick-empty no-print"><span className="quick-empty-icon"><Icon name="report" size={28} /></span><h2>A clear picture, before the next conversation.</h2><p>Spot things worth a closer look, save a report, and share a useful note with the store owner.</p><div><span><Icon name="check" size={14} />No app to install</span><span><Icon name="check" size={14} />Nothing saved to a workspace</span></div></section>}

      {report && !report.ok && !pending && <p className="error quick-error" role="alert"><Icon name="alert" size={18} />{report.error}</p>}

      {report?.ok && (
        <article className="card quick-report" aria-busy={pending}>
          <header className="quick-report-head">
            <div>
              <p className="quick-eyebrow">STORE HEALTH CHECK{state?.preparedBy ? ` · ${state.preparedBy}` : ''}</p>
              <h2>{report.siteName ?? report.host}</h2>
              <p className="small muted" style={{ margin: '4px 0 0' }}>
                <a href={report.url} target="_blank" rel="noreferrer">{report.host}</a> · checked{' '}
                {new Date(report.checkedAt).toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <div className={`quick-report-count${report.looks ? ' has-looks' : ''}`}>
              <strong>{report.looks}</strong>
              <span>{report.looks === 1 ? 'thing' : 'things'} worth a look</span>
            </div>
          </header>

          <div className="quick-report-grid">{report.sections.map((section) => (
            <section key={section.title} className="quick-report-section">
              <h3><span className="quick-section-icon"><Icon name={section.title === 'Speed' ? 'clock' : section.title === 'SSL and domain' ? 'check' : section.title.startsWith('Links') ? 'arrow' : 'store'} size={16} /></span>{section.title}</h3>
              <ul>
                {section.items.map((item, i) => (
                  <li key={i} className={`qr-${item.tone}`}>
                    <span className="qr-dot" aria-hidden="true" />
                    <span className="sr-only">{item.tone === 'look' ? 'Worth a look: ' : 'Fine: '}</span>
                    {item.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}</div>

          <p className="small muted quick-report-footnote">
            One outside look, the way a visitor&rsquo;s browser sees the store. No store access was used.
          </p>

          <div className="no-print quick-result-actions">
            <button type="button" className="btn secondary" onClick={() => window.print()}><Icon name="report" size={16} />Print or save as PDF</button>
          </div>

          <details className="no-print quick-owner-note">
            <summary><Icon name="mail" size={16} />Note for the store owner<Icon name="chevron" size={16} /></summary>
            <textarea aria-label="Note for the store owner" readOnly value={report.note} rows={14} />
            <CopyButton text={report.note} label="Copy note" />
          </details>
        </article>
      )}
    </>
  );
}
