// Outreach report views: which agencies opened the health check or sample report linked in their email.
// Recorded by the public /outreach/r/<token> routes (public.outreach_report_views, service role only) and
// summarised per sent email in the outreach history. No server-only imports here: the history UI uses these helpers.
// Storage and the route logger: outreach-report-views-store.ts.

export type ViewKind = 'health' | 'sample' | 'health_download' | 'sample_download';
export type ReportView = { snapshot_id: string; kind: ViewKind; viewed_at: string; automated: boolean };
export type NewReportView = { snapshot_id: string; kind: ViewKind; automated: boolean; user_agent: string | null };

/** Per sent email: how often a person opened each link, and how many opens look like link scanners. */
export type ViewSummary = { health: number; sample: number; downloads: number; automated: number; first: string | null; last: string | null };

export interface ViewStore {
  record(view: NewReportView): Promise<void>;
  /** Every view of these report-link sets. */
  forSnapshots(ids: string[]): Promise<ReportView[]>;
}

// Mail-security scanners, link-preview bots and scripts open links without a person behind them.
const AUTOMATED = /bot\b|bot\/|crawler|spider|preview|scanner|headless|phantom|python|curl|wget|go-http|java\/|okhttp|axios|node-fetch|undici|libwww|httpclient|safelinks|proofpoint|mimecast|barracuda|forcepoint|ironport|symantec|trendmicro|sophos|zscaler|googleimageproxy|ggpht|yahoomailproxy|microsoft office|ms-office|outlook-ios|skypeuripreview|facebookexternalhit|slackbot|vercel|lighthouse|pagespeed|gtmetrix|uptime|monitor/i;

/** True when the request looks like a scanner or bot rather than a person in a browser. */
export function isAutomated(userAgent: string | null | undefined, purpose?: string | null): boolean {
  if (purpose && /prefetch|preview/i.test(purpose)) return true;
  const ua = (userAgent ?? '').trim();
  if (ua.length < 20 || !/mozilla\//i.test(ua)) return true; // real browsers all send a Mozilla/… user agent
  return AUTOMATED.test(ua);
}

export function viewRow(snapshotId: string, kind: ViewKind, headers: Pick<Headers, 'get'>): NewReportView {
  const ua = headers.get('user-agent');
  return { snapshot_id: snapshotId, kind, automated: isAutomated(ua, headers.get('purpose') ?? headers.get('sec-purpose') ?? headers.get('x-purpose')), user_agent: ua ? ua.slice(0, 300) : null };
}

/** Views grouped by report-link set. Only views by people count toward the opened numbers and dates. */
export function summarizeViews(views: ReportView[]): Map<string, ViewSummary> {
  const out = new Map<string, ViewSummary>();
  for (const v of views) {
    const s = out.get(v.snapshot_id) ?? { health: 0, sample: 0, downloads: 0, automated: 0, first: null, last: null };
    if (v.automated) s.automated++;
    else {
      if (v.kind === 'health') s.health++;
      else if (v.kind === 'sample') s.sample++;
      else s.downloads++;
      if (!s.first || Date.parse(v.viewed_at) < Date.parse(s.first)) s.first = v.viewed_at;
      if (!s.last || Date.parse(v.viewed_at) > Date.parse(s.last)) s.last = v.viewed_at;
    }
    out.set(v.snapshot_id, s);
  }
  return out;
}

export const openedByPerson = (s: ViewSummary | null | undefined) => !!s && s.health + s.sample + s.downloads > 0;

export function memoryViewStore(rows: (NewReportView & { viewed_at: string })[] = [], now = () => new Date().toISOString()): ViewStore {
  return {
    async record(view) { rows.push({ ...view, viewed_at: now() }); },
    async forSnapshots(ids) { const set = new Set(ids); return rows.filter((r) => set.has(r.snapshot_id)).map(({ snapshot_id, kind, viewed_at, automated }) => ({ snapshot_id, kind, viewed_at, automated })); },
  };
}
