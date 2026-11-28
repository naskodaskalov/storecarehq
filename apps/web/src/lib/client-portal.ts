// The client portal: one always-on, agency-branded page per client store at /p/<token>.
// public.public_store_portal() returns the raw shape below (PortalRaw); buildPortal() turns it into what the
// page shows. Keeping the arithmetic here (not in SQL) keeps it testable and identical in demo mode.

import { randomBytes } from 'node:crypto';
import { APP_ORIGIN, isProductionHost } from './domains.ts';

export const PORTAL_TOKEN = /^[a-f0-9]{64}$/;
export const newPortalToken = () => randomBytes(32).toString('hex');
export const portalPath = (token: string) => `/p/${token}`;
/** The full link to send a client: always the app host in production, the current host elsewhere (local, previews). */
export function portalUrl(host: string, token: string) {
  if (isProductionHost(host) || !host) return `${APP_ORIGIN}${portalPath(token)}`;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  return `${local ? 'http' : 'https'}://${host}${portalPath(token)}`;
}

export type PortalRaw = {
  generated_at: string;
  store: { name: string; public_url: string; status: 'active' | 'limited' | 'paused'; limited_reason: string | null; health_score: number | null; timezone: string | null };
  agency: { name: string; brand_color: string | null; logo_url: string | null };
  plan: { name: string; hours_included: number | string; rollover_rule: string } | null;
  month_start: string;
  minutes_this_month: number;
  /** Null when the store was not on the plan for all of last month: no rollover, as in the monthly report. */
  minutes_last_month: number | null;
  work: { work_date: string; minutes: number; text: string }[];
  uptime_days: { day: string; checks: number; ok: number }[];
  last_check: { checked_at: string; ok: boolean; ms: number | null } | null;
  incidents: { kind: 'down' | 'checkout'; opened_at: string; resolved_at: string | null; client_note: string | null }[];
  checkout: { device: 'mobile' | 'desktop'; result: 'pass' | 'fail' | 'blocked'; ran_at: string }[];
  checkout_30d: { runs: number; passed: number } | null;
  speed: { sampled_at: string; performance_score: number | null; lcp_ms: number | null } | null;
  speed_before: { sampled_at: string; performance_score: number | null; lcp_ms: number | null } | null;
  reports: { period: string; share_token: string }[];
  requests: { subject: string; status: 'new' | 'in_progress' | 'done'; urgency: 'normal' | 'urgent'; received_at: string; updated_at: string | null }[];
};

export type Tone = 'good' | 'warn' | 'bad' | 'none';
export type DayCell = { day: string; label: string; tone: Tone; pct: number | null };

export type Portal = {
  storeName: string;
  storeHost: string;
  storeUrl: string;
  agency: { name: string; color: string; logoUrl: string | null };
  status: { tone: Tone; title: string; detail: string };
  checkedAt: string | null;
  uptime: { pct: number | null; days: DayCell[] };
  checkout: { devices: { device: string; ok: boolean | null; label: string }[]; passRate: number | null };
  speed: { score: number | null; delta: number | null; lcpSeconds: number | null } | null;
  health: number | null;
  hours: { planName: string; used: number; included: number; rolledOver: number; available: number; pct: number; remaining: number; over: number } | null;
  monthLabel: string;
  work: { date: string; text: string; hours: number }[];
  incidents: { title: string; when: string; duration: string | null; note: string | null; open: boolean }[];
  reports: { label: string; href: string }[];
  requests: { subject: string; status: string; tone: Tone; urgent: boolean; when: string }[];
  openRequests: number;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const DAY = 864e5;

function dateLabel(iso: string, tz: string, withTime = false) {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: iso.length === 10 ? 'UTC' : tz });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz })}`;
}

export function durationLabel(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h < 48) return rest ? `${h} h ${rest} min` : `${h} h`;
  return `${Math.round(h / 24)} days`;
}

export const REQUEST_STATUS: Record<PortalRaw['requests'][number]['status'], { label: string; tone: Tone }> = {
  new: { label: 'Received', tone: 'none' },
  in_progress: { label: 'In progress', tone: 'warn' },
  done: { label: 'Done', tone: 'good' },
};

/** Thirty days ending today (UTC), oldest first. Days without checks are 'none'. */
export function uptimeDays(rows: PortalRaw['uptime_days'], now: Date): DayCell[] {
  const byDay = new Map(rows.map((r) => [String(r.day).slice(0, 10), r]));
  const out: DayCell[] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now.getTime() - i * DAY).toISOString().slice(0, 10);
    const r = byDay.get(day);
    const pct = r && Number(r.checks) > 0 ? (Number(r.ok) / Number(r.checks)) * 100 : null;
    const tone: Tone = pct === null ? 'none' : pct >= 99.9 ? 'good' : pct >= 98 ? 'warn' : 'bad';
    const label = `${dateLabel(day, 'UTC')}: ${pct === null ? 'no checks' : `${pct >= 99.995 ? '100' : pct.toFixed(2)}% up`}`;
    out.push({ day, label, tone, pct });
  }
  return out;
}

export function buildPortal(raw: PortalRaw, now = new Date(raw.generated_at)): Portal {
  const tz = raw.store.timezone || 'UTC';
  const open = raw.incidents.filter((i) => !i.resolved_at);
  const down = open.some((i) => i.kind === 'down') || raw.last_check?.ok === false;
  const checkoutOpen = open.some((i) => i.kind === 'checkout');
  const status: Portal['status'] =
    raw.store.status === 'paused'
      ? { tone: 'none', title: 'Monitoring is paused', detail: `${raw.agency.name} has paused checks for this store.` }
      : down
        ? { tone: 'bad', title: 'Your store is not responding', detail: `${raw.agency.name} has been alerted and is on it.` }
        : checkoutOpen
          ? { tone: 'warn', title: 'Checkout needs attention', detail: open.find((i) => i.kind === 'checkout')?.client_note || `The daily checkout test failed. ${raw.agency.name} is looking into it.` }
          : raw.last_check
            ? { tone: 'good', title: 'Everything is working', detail: 'Your store is online and the latest checks passed.' }
            : { tone: 'none', title: 'Waiting for the first checks', detail: 'Monitoring has started. Results appear here within the hour.' };

  const days = uptimeDays(raw.uptime_days, now);
  const checks = raw.uptime_days.reduce((a, d) => a + Number(d.checks), 0);
  const ok = raw.uptime_days.reduce((a, d) => a + Number(d.ok), 0);
  const uptimePct = checks ? Math.floor((ok / checks) * 10000) / 100 : null;

  const devices = (['mobile', 'desktop'] as const)
    .map((device) => raw.checkout.find((c) => c.device === device))
    .filter((c): c is PortalRaw['checkout'][number] => !!c)
    .map((c) => ({
      device: c.device === 'mobile' ? 'Mobile' : 'Desktop',
      ok: c.result === 'blocked' ? null : c.result === 'pass',
      label: c.result === 'pass' ? `Passed ${dateLabel(c.ran_at, tz, true)}` : c.result === 'fail' ? `Failed ${dateLabel(c.ran_at, tz, true)}` : 'Not tested (bot check)',
    }));
  const c30 = raw.checkout_30d;
  const passRate = c30 && Number(c30.runs) > 0 ? Math.round((Number(c30.passed) / Number(c30.runs)) * 100) : null;

  const score = raw.speed?.performance_score ?? null;
  const before = raw.speed_before?.performance_score ?? null;
  const speed = raw.speed
    ? { score, delta: score !== null && before !== null ? score - before : null, lcpSeconds: raw.speed.lcp_ms ? round1(raw.speed.lcp_ms / 1000) : null }
    : null;

  let hours: Portal['hours'] = null;
  if (raw.plan) {
    const included = Number(raw.plan.hours_included) || 0;
    const used = round1(Number(raw.minutes_this_month) / 60);
    const rolledOver = raw.plan.rollover_rule === 'one_month' && raw.minutes_last_month !== null ? round1(Math.max(0, included - Number(raw.minutes_last_month) / 60)) : 0;
    const available = round1(included + rolledOver);
    hours = {
      planName: raw.plan.name,
      used,
      included,
      rolledOver,
      available,
      pct: available > 0 ? Math.min(100, Math.round((used / available) * 100)) : used > 0 ? 100 : 0,
      remaining: round1(Math.max(0, available - used)),
      over: round1(Math.max(0, used - available)),
    };
  }

  const monthLabel = new Date(`${String(raw.month_start).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return {
    storeName: raw.store.name,
    storeHost: raw.store.public_url.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    storeUrl: raw.store.public_url,
    agency: { name: raw.agency.name, color: /^#[0-9a-f]{6}$/i.test(raw.agency.brand_color ?? '') ? raw.agency.brand_color! : '#2747A8', logoUrl: raw.agency.logo_url },
    status,
    checkedAt: raw.last_check ? dateLabel(raw.last_check.checked_at, tz, true) : null,
    uptime: { pct: uptimePct, days },
    checkout: { devices, passRate },
    speed,
    health: raw.store.health_score,
    hours,
    monthLabel,
    work: raw.work.map((w) => ({ date: dateLabel(String(w.work_date).slice(0, 10), tz), text: w.text, hours: round1(w.minutes / 60) })),
    incidents: raw.incidents.map((i) => ({
      title: i.kind === 'down' ? (i.resolved_at ? 'Store was unreachable' : 'Store is unreachable') : i.resolved_at ? 'Checkout problem, fixed' : 'Checkout problem',
      when: dateLabel(i.opened_at, tz, true),
      duration: i.resolved_at ? durationLabel(new Date(i.resolved_at).getTime() - new Date(i.opened_at).getTime()) : null,
      note: i.client_note,
      open: !i.resolved_at,
    })),
    reports: raw.reports.map((r) => ({
      label: new Date(`${String(r.period).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      href: `/r/${r.share_token}`,
    })),
    requests: raw.requests.map((q) => ({
      subject: q.subject,
      status: REQUEST_STATUS[q.status]?.label ?? q.status,
      tone: REQUEST_STATUS[q.status]?.tone ?? 'none',
      urgent: q.urgency === 'urgent',
      when: dateLabel(q.received_at, tz),
    })),
    openRequests: raw.requests.filter((q) => q.status !== 'done').length,
  };
}

// Requests ---------------------------------------------------------------------------------------------

export type RequestInput = { name: string | null; email: string; subject: string; body: string | null; urgency: 'normal' | 'urgent' };

/** Same rules as submit_portal_request(), checked first so the client gets a friendly message without a round trip. */
export function parseRequest(form: { get(name: string): unknown }): { ok: true; value: RequestInput } | { ok: false; error: string } {
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const name = s('name') || null;
  const email = s('email').toLowerCase();
  const subject = s('subject').replace(/\s+/g, ' ');
  const body = s('body') || null;
  const urgency = s('urgency') === 'urgent' ? 'urgent' : 'normal';
  if (!subject) return { ok: false, error: REQUEST_ERRORS.subject_required };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: REQUEST_ERRORS.email_invalid };
  if (subject.length > 200 || (body?.length ?? 0) > 5000 || (name?.length ?? 0) > 120 || email.length > 320) return { ok: false, error: REQUEST_ERRORS.too_long };
  return { ok: true, value: { name, email, subject, body, urgency } };
}

export const REQUEST_ERRORS: Record<string, string> = {
  subject_required: 'Say in a few words what you need.',
  email_invalid: 'Enter your email address so we can reply.',
  too_long: 'That is a bit long. Keep the summary under 200 characters and the details under 5,000.',
  urgency_invalid: 'Choose how urgent this is.',
  rate_limited: 'We have received a lot of requests from this page in the last hour. Please try again later or email us directly.',
  portal_not_found: 'This page is no longer available. Ask your agency for a new link.',
};

/** Maps a database error ("rate_limited", or a message containing it) to text for the client. */
export function requestErrorMessage(message: string | null | undefined): string {
  const code = Object.keys(REQUEST_ERRORS).find((k) => message?.includes(k));
  return code ? REQUEST_ERRORS[code] : 'Something went wrong sending your request. Please try again in a minute.';
}

// Demo mode: the same payload public_store_portal() returns, built from in-memory rows. --------------------

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export function portalRawFromRows(t: Record<string, Row[]>, token: string, now = new Date()): PortalRaw | null {
  if (!PORTAL_TOKEN.test(token)) return null;
  const s = t.stores.find((x) => x.portal_token === token);
  if (!s) return null;
  const a = t.agencies.find((x) => x.id === s.agency_id);
  if (!a) return null;
  const of = (table: string) => (t[table] ?? []).filter((r) => r.store_id === s.id);
  const nowMs = now.getTime();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const since = (days: number) => new Date(nowMs - days * DAY).toISOString();
  const work = of('work_entries');
  const minutes = (from: string, to?: string) => work.filter((w) => w.counts_to_plan && w.work_date >= from && (!to || w.work_date < to)).reduce((x, w) => x + w.minutes, 0);
  const ups = of('uptime_checks').filter((u) => u.checked_at >= since(30));
  const byDay = new Map<string, { day: string; checks: number; ok: number }>();
  for (const u of ups) {
    const day = u.checked_at.slice(0, 10);
    const d = byDay.get(day) ?? { day, checks: 0, ok: 0 };
    d.checks++;
    if (u.ok) d.ok++;
    byDay.set(day, d);
  }
  const last = [...of('uptime_checks')].sort((x, y) => y.checked_at.localeCompare(x.checked_at))[0];
  const runs = of('checkout_runs');
  const latestRun = (device: string) => runs.filter((r) => r.device === device && r.ran_at >= since(3)).sort((x, y) => y.ran_at.localeCompare(x.ran_at))[0];
  const runs30 = runs.filter((r) => r.ran_at >= since(30) && r.result !== 'blocked');
  const speed = of('speed_samples').filter((x) => x.page === 'home' && x.strategy === 'mobile').sort((x, y) => y.sampled_at.localeCompare(x.sampled_at));
  const plan = (t.care_plans ?? []).find((c) => c.store_id === s.id);
  return {
    generated_at: now.toISOString(),
    store: { name: s.name, public_url: s.public_url, status: s.status, limited_reason: s.limited_reason, health_score: s.health_score, timezone: s.timezone },
    agency: { name: a.name, brand_color: a.brand_color, logo_url: a.logo_url ?? null },
    plan: plan ? { name: plan.name, hours_included: plan.hours_included, rollover_rule: plan.rollover_rule } : null,
    month_start: monthStart,
    minutes_this_month: minutes(monthStart),
    minutes_last_month: !s.created_at || s.created_at.slice(0, 10) <= prevStart ? minutes(prevStart, monthStart) : null,
    work: work
      .filter((w) => w.work_date >= since(45).slice(0, 10) && (w.counts_to_plan || w.client_text?.trim()))
      .sort((x, y) => y.work_date.localeCompare(x.work_date) || String(y.created_at).localeCompare(String(x.created_at)))
      .slice(0, 30)
      .map((w) => ({ work_date: w.work_date, minutes: w.minutes, text: w.client_text?.trim() || w.title })),
    uptime_days: [...byDay.values()].sort((x, y) => x.day.localeCompare(y.day)),
    last_check: last ? { checked_at: last.checked_at, ok: last.ok, ms: last.ms } : null,
    incidents: of('incidents')
      .filter((i) => !i.resolved_at || i.opened_at >= since(30))
      .sort((x, y) => y.opened_at.localeCompare(x.opened_at))
      .slice(0, 10)
      .map((i) => ({ kind: i.kind, opened_at: i.opened_at, resolved_at: i.resolved_at, client_note: i.client_note })),
    checkout: (['desktop', 'mobile'] as const).map(latestRun).filter(Boolean).map((r) => ({ device: r.device, result: r.result, ran_at: r.ran_at })),
    checkout_30d: { runs: runs30.length, passed: runs30.filter((r) => r.result === 'pass').length },
    speed: speed[0] ? { sampled_at: speed[0].sampled_at, performance_score: speed[0].performance_score, lcp_ms: speed[0].lcp_ms } : null,
    speed_before: (() => {
      const b = speed.find((x) => x.sampled_at <= since(28));
      return b ? { sampled_at: b.sampled_at, performance_score: b.performance_score, lcp_ms: b.lcp_ms } : null;
    })(),
    reports: of('reports')
      .filter((r) => r.status === 'approved' || r.status === 'sent')
      .sort((x, y) => y.period.localeCompare(x.period))
      .slice(0, 12)
      .map((r) => ({ period: r.period, share_token: r.share_token })),
    requests: of('requests')
      .filter((q) => q.status !== 'done' || q.received_at >= since(60))
      .sort((x, y) => y.received_at.localeCompare(x.received_at))
      .slice(0, 20)
      .map((q) => ({ subject: q.subject, status: q.status, urgency: q.urgency ?? 'normal', received_at: q.received_at, updated_at: q.updated_at ?? null })),
  };
}
