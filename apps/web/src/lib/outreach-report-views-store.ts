// Server-side storage for outreach report views (public.outreach_report_views, service role only), and the
// logger the public report routes call after responding.
import { memoryViewStore, viewRow, type NewReportView, type ReportView, type ViewKind, type ViewStore } from './outreach-report-views.ts';

export async function viewStore(): Promise<ViewStore> {
  if (process.env.STORECARE_DEMO === '1') {
    const scope = globalThis as typeof globalThis & { storecareOutreachViews?: (NewReportView & { viewed_at: string })[] };
    scope.storecareOutreachViews ||= [];
    return memoryViewStore(scope.storecareOutreachViews);
  }
  const { supabaseAdmin } = await import('./supabase-admin.ts');
  const client = supabaseAdmin();
  return {
    async record(view) { const { error } = await client.from('outreach_report_views').insert(view); if (error) throw new Error('Report view could not be saved.'); },
    async forSnapshots(ids) {
      if (!ids.length) return [];
      const out: ReportView[] = [];
      for (let i = 0; i < ids.length; i += 200) { // keep the "in" filter URL short
        const { data, error } = await client.from('outreach_report_views').select('snapshot_id,kind,viewed_at,automated').in('snapshot_id', ids.slice(i, i + 200)).limit(5000);
        if (error) throw new Error('Report views are unavailable. Apply the outreach-report-views migration.');
        out.push(...((data ?? []) as ReportView[]));
      }
      return out;
    },
  };
}

/** The request details a view is logged from, captured before the response (request APIs are unavailable later). */
export type ViewContext = { headers: Pick<Headers, 'get'>; admin: boolean };

/** True when the visitor is a signed-in admin. Only asks Supabase when a login cookie is present, so agencies wait for nothing. */
export async function viewerIsAdmin(cookieNames: string[]): Promise<boolean> {
  if (!cookieNames.some((n) => n.startsWith('sb-'))) return false;
  try { const { currentUserIsAdmin } = await import('./admin-session.ts'); return await currentUserIsAdmin(); } catch { return false; }
}

/** For the public report routes, run after the response: log the view without ever failing the page. Admin views are skipped. */
export async function logReportView(snapshotId: string, kind: ViewKind, context: ViewContext, store?: ViewStore) {
  if (context.admin) return;
  try { await (store ?? await viewStore()).record(viewRow(snapshotId, kind, context.headers)); }
  catch { /* a missing table or a storage hiccup must not break the report for the agency */ }
}
