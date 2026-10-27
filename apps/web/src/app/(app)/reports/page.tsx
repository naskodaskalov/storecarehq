import Link from 'next/link';
import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';

export default async function Reports() {
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const { data: reports } = await supabase
    .from('reports')
    .select('id, period, status, sent_at, stores(name)')
    .eq('agency_id', agency.id)
    .order('period', { ascending: false });

  return (
    <>
      <h1>Reports</h1>
      <section className="card">
        <p className="muted" style={{ margin: 0 }}>
          Each store&apos;s report drafts itself on the last day of the month from its incidents, changes, checks and your work log.
          You review and approve it before anything reaches the client.
        </p>
        {!reports?.length ? (
          <p style={{ margin: 0 }}>No reports yet. The first drafts appear at the end of this month. <Link href="/">Back to stores</Link></p>
        ) : (
          <table>
            <thead><tr><th>Store</th><th>Month</th><th>Status</th></tr></thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id}>
                  <td>{(r.stores as unknown as { name: string } | null)?.name}</td>
                  <td className="mono">{r.period.slice(0, 7)}</td>
                  <td>{r.status === 'sent' ? `Sent ${r.sent_at?.slice(0, 10)}` : r.status === 'approved' ? 'Approved' : 'Draft ready'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
