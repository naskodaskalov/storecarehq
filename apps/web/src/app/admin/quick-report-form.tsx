'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { CopyButton } from '@/components/copy-button';
import { quickReport, type QuickReportState } from './actions';

export function QuickReportForm() {
  const [state, action, pending] = useActionState<QuickReportState, FormData>(quickReport, null);
  const report = state?.report;

  return (
    <>
      <form action={action} className="card admin-form no-print">
        <div className="admin-form-row">
          <label className="field" style={{ flex: '2 1 260px' }}>
            <span>Store address</span>
            <input name="url" required placeholder="clientstore.com" defaultValue={state?.input ?? ''} autoComplete="off" />
          </label>
          <label className="field" style={{ flex: '1 1 180px' }}>
            <span>Prepared by (optional)</span>
            <input name="preparedBy" placeholder="Your agency name" defaultValue={state?.preparedBy ?? ''} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <SubmitButton pending={pending} pendingText="Checking the store… up to a minute">Run report</SubmitButton>
          <span className="small muted">Checks speed, SSL, domain, links, theme, apps, products and the cart.</span>
        </div>
      </form>

      {report && !report.ok && !pending && <p className="error" role="alert">{report.error}</p>}

      {report?.ok && (
        <article className="card quick-report" aria-busy={pending}>
          <header className="quick-report-head">
            <div>
              <p className="small muted" style={{ margin: 0 }}>Store health check{state?.preparedBy ? ` · prepared by ${state.preparedBy}` : ''}</p>
              <h2 style={{ margin: '4px 0 0' }}>{report.siteName ?? report.host}</h2>
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

          {report.sections.map((section) => (
            <section key={section.title} className="quick-report-section">
              <h3>{section.title}</h3>
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
          ))}

          <p className="small muted" style={{ margin: 0 }}>
            One outside look, the way a visitor&rsquo;s browser sees the store. No store access was used.
          </p>

          <div className="no-print" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" onClick={() => window.print()}>Print or save as PDF</button>
          </div>

          <details className="no-print">
            <summary className="small" style={{ cursor: 'pointer', fontWeight: 600 }}>Note for the store owner</summary>
            <textarea readOnly value={report.note} rows={14} style={{ width: '100%', marginTop: 10, font: 'inherit', fontSize: 13 }} />
            <CopyButton text={report.note} label="Copy note" />
          </details>
        </article>
      )}
    </>
  );
}
