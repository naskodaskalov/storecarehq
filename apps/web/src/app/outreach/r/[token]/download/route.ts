import { readPublicReport, reportStore } from '@/lib/outreach-report-links';

export const dynamic = 'force-dynamic';
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Robots-Tag': 'noindex, nofollow, noarchive', 'Referrer-Policy': 'no-referrer' };
  const report = /^[a-f0-9]{64}$/.test(token) ? await readPublicReport(token, await reportStore()) : null;
  if (!report) return new Response('Report not found or no longer available.', { status: 404, headers });
  return new Response(report.document.html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="${report.kind === 'health' ? 'current-health-check' : 'sample-monthly-report'}.html"`, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" } });
}
