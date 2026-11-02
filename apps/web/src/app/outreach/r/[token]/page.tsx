import { notFound } from 'next/navigation';
import { DEFAULT_SECTIONS } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { PrintButton } from '@/components/copy-button';
import { readPublicReport, reportStore } from '@/lib/outreach-report-links';
import { SAMPLE_NOTICE } from '@/lib/sample-month-report';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata = { title: 'StoreCare HQ report', robots: { index: false, follow: false, noarchive: true } };

export default async function OutreachReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) notFound();
  const report = await readPublicReport(token, await reportStore());
  if (!report) notFound();
  return <main style={{ maxWidth: 850, margin: '0 auto', padding: '32px 16px', display: 'grid', gap: 20 }}>
    <nav className="no-print" aria-label="Report downloads" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
      <PrintButton /><a className="btn secondary" href={`/outreach/r/${token}/download`}>Download HTML</a>
      <p className="small muted">Save as PDF opens your browser’s print dialog. Link expires {report.expiresAt.slice(0, 10)}.</p>
    </nav>
    {report.kind === 'sample' ? <>
      <p style={{ padding: 16, border: '2px solid #a17b24', background: '#fff4cf' }}>{SAMPLE_NOTICE}</p>
      <ReportView facts={report.sample.facts} summary={report.sample.summary} sections={DEFAULT_SECTIONS} />
      <p style={{ padding: 16, border: '2px solid #a17b24' }}>{SAMPLE_NOTICE}</p>
    </> : <article className="card">
      <p className="small muted">StoreCare HQ · Public storefront snapshot</p><h1>{report.health.host}</h1>
      <p>Checked {report.health.checkedAt}</p><p>One outside look, with no historical monitoring or full checkout test. Unavailable checks require verification.</p>
      {report.health.sections.map(s => <section key={s.title}><h2>{s.title}</h2><ul>{s.items.map((item, i) => <li key={i}>{item.text}</li>)}</ul></section>)}
    </article>}
  </main>;
}
