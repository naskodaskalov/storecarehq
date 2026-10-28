// Turns a month of raw rows into the facts a client sees. Every number in the report comes from here.

import { dayLabel } from './period.ts';
import type { Facts, MonthData } from './types.ts';

const round1 = (n: number) => Math.round(n * 10) / 10;
const host = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '');

const CHANGE_LIMIT = 5;

export function buildFacts(d: MonthData): Facts {
  const uptimeChecks = d.uptime.checks;
  // Two decimals: 99.98% and 100% read differently to a client.
  const uptimePct = uptimeChecks ? Math.round((d.uptime.ok / uptimeChecks) * 10000) / 100 : null;

  const incidents = d.incidents.map((i) => ({
    title: i.kind === 'down' ? 'Store was unreachable' : 'Checkout test failed',
    when: dayLabel(i.opened_at),
    resolved: !!i.resolved_at,
    minutesToFix: i.resolved_at ? Math.max(1, Math.round((Date.parse(i.resolved_at) - Date.parse(i.opened_at)) / 60000)) : null,
    note: i.client_note,
  }));

  const runs = d.checkoutRuns;
  const checkout = runs.length
    ? {
        runs: runs.length,
        passed: runs.filter((r) => r.result === 'pass').length,
        failed: runs.filter((r) => r.result === 'fail').length,
        blocked: runs.filter((r) => r.result === 'blocked').length,
      }
    : null;

  const withLcp = d.speed.filter((s) => s.lcp_ms !== null);
  const speed = withLcp.length
    ? {
        lcpStart: withLcp[0].lcp_ms,
        lcpEnd: withLcp.at(-1)!.lcp_ms,
        scoreEnd: d.speed.at(-1)?.performance_score ?? null,
      }
    : null;

  // Risky first, then the agency's own work, then the rest; newest first within each.
  const rank = (c: MonthData['changes'][number]) => (c.risky ? 0 : c.work_entry_id ? 1 : 2);
  const highlights = [...d.changes]
    .sort((a, b) => rank(a) - rank(b) || b.occurred_at.localeCompare(a.occurred_at))
    .slice(0, CHANGE_LIMIT)
    .map((c) => ({ when: dayLabel(c.occurred_at), summary: c.summary, byAgency: !!c.work_entry_id, risky: c.risky }));

  const billable = d.work.filter((w) => w.counts_to_plan);
  const hoursUsed = round1(billable.reduce((a, w) => a + w.minutes, 0) / 60);
  const included = d.plan ? Number(d.plan.hours_included) : null;
  const rolledOver =
    d.plan && d.plan.rollover_rule === 'one_month' && d.previousMonthMinutes !== null && included !== null
      ? round1(Math.max(0, included - d.previousMonthMinutes / 60))
      : 0;

  const facts: Facts = {
    period: d.period,
    storeName: d.store.name,
    storeHost: host(d.store.public_url),
    agencyName: d.agency.name,
    brandColor: d.agency.brand_color,
    healthScore: d.store.health_score,
    limited: d.store.status === 'limited' ? d.store.limited_reason : null,
    uptimePct,
    uptimeChecks,
    incidents,
    checkout,
    speed,
    changes: { total: d.changes.length, highlights },
    work: {
      // Client-facing work only: billable entries, plus unbilled ones the agency wrote client wording for.
      // An unbilled entry with only an internal title ("Internal call") stays out of the report.
      entries: d.work
        .filter((w) => w.counts_to_plan || w.client_text?.trim())
        .sort((a, b) => a.work_date.localeCompare(b.work_date))
        .map((w) => ({ date: dayLabel(`${w.work_date}T12:00:00Z`), text: w.client_text?.trim() || w.title, hours: round1(w.minutes / 60) })),
      hoursUsed,
      hoursIncluded: included,
      rolledOver,
      planName: d.plan?.name ?? null,
    },
    recommendations: [],
  };
  facts.recommendations = recommend(facts, d);
  return facts;
}

/** Simple, explainable rules. At most three, most useful first. */
export function recommend(f: Facts, d: MonthData): Facts['recommendations'] {
  const out: Facts['recommendations'] = [];
  if (f.speed?.lcpEnd && f.speed.lcpEnd > 2500) {
    out.push({
      title: 'Speed up the home page on mobile',
      detail: `The main content takes ${(f.speed.lcpEnd / 1000).toFixed(1)}s to appear on a phone, above Google's 2.5s target. Image sizes and third-party scripts are the usual causes.`,
    });
  }
  const unexplainedRisky = d.changes.filter((c) => c.risky && !c.work_entry_id).length;
  if (unexplainedRisky) {
    out.push({
      title: 'Tell us before big changes',
      detail: `${unexplainedRisky === 1 ? 'One significant change was' : `${unexplainedRisky} significant changes were`} made to the store outside our care work this month. A heads-up before bulk price edits or theme switches lets us check checkout right after.`,
    });
  }
  const unknown = d.apps.filter((a) => !a.known).length;
  if (unknown >= 5) {
    out.push({
      title: 'Review apps and scripts',
      detail: `The store loads scripts from ${unknown} services we couldn't identify. Removing unused ones usually helps load time.`,
    });
  }
  if (f.checkout && f.checkout.failed > 0) {
    out.push({ title: 'Keep the daily checkout test on', detail: 'It caught a checkout problem this month before customers reported it.' });
  }
  if (f.work.hoursIncluded !== null && f.work.hoursUsed > f.work.hoursIncluded + f.work.rolledOver) {
    out.push({
      title: 'Review the plan size',
      detail: `This month used ${f.work.hoursUsed}h against ${f.work.hoursIncluded}h in the plan. If this continues, a larger plan would cost less than extra hours.`,
    });
  }
  return out.slice(0, 3);
}
