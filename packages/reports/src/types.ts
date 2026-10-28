// Plain data in, plain data out: loaders (web app via Supabase, worker via pg) fill MonthData,
// everything else here is pure so it can be tested and reused.

export type Period = { start: string; end: string; label: string }; // [start, end) as YYYY-MM-DD

export type MonthData = {
  period: Period;
  store: { name: string; public_url: string; health_score: number | null; status: string; limited_reason: string | null };
  agency: { name: string; brand_color: string };
  plan: { name: string; hours_included: number; rollover_rule: string } | null;
  uptime: { checks: number; ok: number }; // counted in the database (a month is ~1,440 checks)
  incidents: { kind: string; opened_at: string; resolved_at: string | null; cause: string | null; client_note: string | null }[];
  checkoutRuns: { ran_at: string; result: 'pass' | 'fail' | 'blocked' }[];
  speed: { sampled_at: string; performance_score: number | null; lcp_ms: number | null }[]; // home page, oldest first
  changes: { occurred_at: string; kind: string; summary: string; risky: boolean; work_entry_id: string | null }[];
  work: { id: string; work_date: string; minutes: number; title: string; client_text: string | null; counts_to_plan: boolean }[];
  apps: { key: string; name: string; known: boolean }[]; // latest snapshot
  previousMonthMinutes: number | null; // for rollover
};

export type Facts = {
  period: Period;
  storeName: string;
  storeHost: string;
  agencyName: string;
  brandColor: string;
  healthScore: number | null;
  limited: string | null;
  uptimePct: number | null;
  uptimeChecks: number;
  incidents: { title: string; when: string; resolved: boolean; minutesToFix: number | null; note: string | null }[];
  checkout: { runs: number; passed: number; failed: number; blocked: number } | null;
  speed: { lcpStart: number | null; lcpEnd: number | null; scoreEnd: number | null } | null;
  changes: { total: number; highlights: { when: string; summary: string; byAgency: boolean; risky: boolean }[] };
  work: {
    entries: { date: string; text: string; hours: number }[];
    hoursUsed: number;
    hoursIncluded: number | null;
    rolledOver: number;
    planName: string | null;
  };
  recommendations: { title: string; detail: string }[];
};

export type Sections = {
  summary: boolean;
  checks: boolean;
  incidents: boolean;
  work: boolean;
  changes: boolean;
  recommendations: boolean;
};

export const DEFAULT_SECTIONS: Sections = {
  summary: true,
  checks: true,
  incidents: true,
  work: true,
  changes: true,
  recommendations: true,
};
