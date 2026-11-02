import { buildFacts, monthPeriod, previousPeriod, type MonthData } from '@storecare/reports';

export const SAMPLE_NOTICE = 'ILLUSTRATIVE SAMPLE — fictional store, work, hours and monitoring data. No work was performed. Not endorsed by the named agency.';

export function sampleMonthReport(agency: string, preparedAt: string) {
  const date = new Date(preparedAt);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid preparation date.');
  const period = previousPeriod(monthPeriod(date.toISOString().slice(0, 7)));
  const tasks = [['Theme adjustments', 120], ['Image optimization', 90], ['App review', 60], ['Maintenance review', 30]] as const;
  const data: MonthData = {
    period, agency: { name: agency, brand_color: '#2747A8' },
    store: { name: 'Juniper Sample Store · illustrative', public_url: 'https://sample.example.com', health_score: 94, status: 'active', limited_reason: null },
    plan: { name: 'Sample care plan', hours_included: 10, rollover_rule: 'none' },
    uptime: { checks: 1440, ok: 1440, avgMs: 340 }, incidents: [],
    checkoutRuns: [{ ran_at: `${period.start}T08:00:00Z`, result: 'pass' }],
    speed: [{ sampled_at: `${period.start}T08:00:00Z`, performance_score: 74, lcp_ms: 2100 }],
    changes: [], apps: [], previousMonthMinutes: 0,
    work: tasks.map(([title, minutes], i) => ({ id: `sample-${i}`, work_date: `${period.start.slice(0, 8)}${String(3 + i * 6).padStart(2, '0')}`, minutes, title, client_text: `Sample: ${title}`, counts_to_plan: true })),
  };
  return { facts: buildFacts(data), summary: `${SAMPLE_NOTICE}\nExample month: 5 hours used from a 10-hour care plan. This demonstrates the report format; all figures are illustrative.` };
}
