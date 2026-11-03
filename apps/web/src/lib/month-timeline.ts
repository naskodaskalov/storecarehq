// One store's month, day by day: what was checked, what changed, what was logged, and where each day
// lands in the client's report. Pure, so the store page and tests build exactly the same days.

import { dayLabel, type Facts, type Period } from '@storecare/reports';
import { dayKey } from './day.ts';

export { dayKey };

export type TimelineTone = 'risk' | 'good' | 'plain' | 'work';
export type TimelineEvent = { time: string; text: string; tone: TimelineTone; changeId?: number | string };
export type TimelineDay = {
  /** 1–31 */
  day: number;
  date: string; // YYYY-MM-DD in the store's time zone
  weekday: string;
  future: boolean;
  /** Mobile speed score that day (latest reading), or null when nothing was measured. */
  speed: number | null;
  events: TimelineEvent[];
  /** What a day with no events still proves. */
  quiet: string;
  /** Where this day shows up in the client's report. */
  report: string[];
};

export type TimelineInput = {
  period: Period;
  timeZone: string;
  now: Date;
  facts: Facts;
  changes: { id: number | string; occurred_at: string; kind: string; summary: string; risky: boolean; work_entry_id: string | null; work_title?: string | null }[];
  incidents: { kind: string; opened_at: string; resolved_at: string | null; cause: string | null; client_note: string | null }[];
  runs: { ran_at: string; result: string; device: string | null; failed_step: string | null }[];
  speed: { sampled_at: string; performance_score: number | null }[];
  work: { id: string; work_date: string; minutes: number; title: string; client_text: string | null; counts_to_plan: boolean; created_at?: string | null }[];
};

const clock = (iso: string, timeZone: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h && m ? `${h} h ${m} min` : h ? `${h} h` : `${m} min`;
};
const minutesBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 60000));
const hours1 = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

export function buildTimeline(i: TimelineInput): TimelineDay[] {
  const { period, timeZone: tz, facts: f } = i;
  const today = dayKey(i.now, tz);
  const [y, m] = period.start.split('-').map(Number);
  const length = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const inProgress = today < period.end;

  const days: TimelineDay[] = Array.from({ length }, (_, n) => {
    const date = `${period.start.slice(0, 8)}${String(n + 1).padStart(2, '0')}`;
    return {
      day: n + 1,
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
      future: date > today,
      speed: null,
      events: [],
      quiet: '',
      report: [],
    };
  });
  const byDate = new Map(days.map((d) => [d.date, d]));
  const at = (iso: string) => byDate.get(dayKey(iso, tz));
  const timed: Map<TimelineEvent, string> = new Map(); // event → sort key (ISO), so events read in time order

  const push = (d: TimelineDay | undefined, e: TimelineEvent, iso: string | null) => {
    if (!d) return;
    d.events.push(e);
    timed.set(e, iso ?? '9999');
  };
  const note = (d: TimelineDay | undefined, line: string) => {
    if (d && !d.report.includes(line)) d.report.push(line);
  };

  // Speed: the day's latest reading, and big moves called out as events.
  const speed = [...i.speed].filter((s) => s.performance_score !== null).sort((a, b) => a.sampled_at.localeCompare(b.sampled_at));
  let last: number | null = null;
  for (const s of speed) {
    const d = at(s.sampled_at);
    const score = s.performance_score!;
    if (d) {
      d.speed = score;
      if (last !== null && Math.abs(score - last) >= 8) {
        const up = score > last;
        push(d, { time: clock(s.sampled_at, tz), text: `Mobile speed score ${up ? 'up' : 'down'} from ${last} to ${score}`, tone: up ? 'good' : 'risk' }, s.sampled_at);
        note(d, up
          ? `Speed: the mobile score rose from ${last} to ${score}; the report shows mobile load at ${f.speed?.lcpEnd ? `${(f.speed.lcpEnd / 1000).toFixed(1)}s` : 'its latest reading'}.`
          : `Speed: the mobile score fell from ${last} to ${score}. Worth a look before the report goes out.`);
      }
    }
    last = score;
  }

  // Incidents: opened (with the alert), and resolved, each on its own day.
  for (const inc of i.incidents) {
    const down = inc.kind === 'down';
    const opened = at(inc.opened_at);
    push(opened, {
      time: clock(inc.opened_at, tz),
      text: `${down ? 'Store unreachable' : 'Checkout incident opened'}${inc.cause ? `: ${inc.cause}` : ''}. Alert sent`,
      tone: 'risk',
    }, inc.opened_at);
    if (inc.resolved_at) {
      const mins = minutesBetween(inc.opened_at, inc.resolved_at);
      push(at(inc.resolved_at), { time: clock(inc.resolved_at, tz), text: down ? `Store back up after ${mins} min` : `Checkout test passed again, down for ${mins} min`, tone: 'good' }, inc.resolved_at);
    }
    const title = down ? 'Store was unreachable' : 'Checkout test failed';
    const listed = f.incidents.find((x) => x.title === title && x.when === dayLabel(inc.opened_at));
    if (listed) {
      const fix = listed.minutesToFix ? `, fixed in ${listed.minutesToFix} min` : listed.resolved ? ', resolved' : ', still being handled';
      const said = listed.note?.trim();
      note(opened, `Incidents: ${title.toLowerCase()} on ${listed.when}${fix}${said ? `, “${said}”${/[.!?]$/.test(said) ? '' : '.'}` : '. Add a note for the client before you send.'}`);
    }
  }

  // Failed checkout runs (passes are the quiet days).
  for (const r of i.runs) {
    const d = at(r.ran_at);
    if (r.result === 'fail') {
      push(d, { time: clock(r.ran_at, tz), text: `Checkout test failed${r.device ? ` on ${r.device}` : ''}${r.failed_step ? ` at the ${r.failed_step.replace(/_/g, ' ')} step` : ''}`, tone: 'risk' }, r.ran_at);
      if (f.checkout) note(d, `Store health: checkout test ${f.checkout.passed}/${f.checkout.runs}, ${f.checkout.failed === 1 ? 'with this as the one failed run' : `one of ${f.checkout.failed} failed runs`}.`);
    }
  }

  // Changes: matched to the work log or not, and whether they made the report's highlights.
  for (const c of i.changes) {
    const d = at(c.occurred_at);
    const matched = !!c.work_entry_id;
    push(d, {
      time: clock(c.occurred_at, tz),
      text: matched ? `${c.summary}, matched to your work log${c.work_title ? `: ${c.work_title}` : ''}` : `${c.summary}${c.risky ? ', not in your work log' : ''}`,
      tone: c.risky && !matched ? 'risk' : 'plain',
      changeId: c.id,
    }, c.occurred_at);
    const shown = f.changes.highlights.some((h) => h.summary === c.summary && h.when === dayLabel(c.occurred_at));
    if (shown) {
      note(d, `Changes to the store: “${c.summary}”${matched ? ', marked as our work' : ''}.${c.risky && !matched ? ' Flagged for you: check it before the report goes out.' : ''}`);
    } else {
      note(d, `Counted in “${f.changes.total} detected” under Changes to the store, but not one of the ${f.changes.highlights.length} listed.`);
    }
  }

  // Work: what the agency logged, and how it reads to the client.
  for (const w of i.work) {
    const d = byDate.get(w.work_date);
    const sameDay = w.created_at && dayKey(w.created_at, tz) === w.work_date;
    push(d, { time: sameDay ? clock(w.created_at!, tz) : '', text: `You logged: ${w.title}, ${duration(w.minutes)}`, tone: 'work' }, sameDay ? w.created_at! : null);
    if (w.counts_to_plan || w.client_text?.trim()) {
      const plan = f.work.hoursIncluded !== null ? `counted against the ${f.work.hoursIncluded + f.work.rolledOver} h plan` : 'counted in hours used';
      note(d, `Work we did (${hours1(w.minutes)} h, ${w.counts_to_plan ? plan : 'not counted against the plan'}): “${w.client_text?.trim() || w.title}”${w.client_text?.trim() ? '' : '. Shown by its log title; add client wording if it should read differently.'}`);
    } else {
      note(d, 'Internal work: stays out of the report.');
    }
  }

  const sofar = inProgress ? ' so far' : '';
  const uptime = f.uptimePct !== null ? `${f.uptimePct}% uptime` : null;
  const checkout = f.checkout ? `${f.checkout.passed} of ${f.checkout.runs} checkout passes` : null;
  const counts = [uptime, checkout].filter(Boolean).join(' and ');
  const passedOn = new Map<string, string[]>();
  for (const r of i.runs) {
    if (r.result !== 'pass') continue;
    const key = dayKey(r.ran_at, tz);
    passedOn.set(key, [...(passedOn.get(key) ?? []), r.device ?? 'checkout']);
  }

  for (const d of days) {
    d.events.sort((a, b) => timed.get(a)!.localeCompare(timed.get(b)!));
    const passes = [...new Set(passedOn.get(d.date) ?? [])];
    d.quiet = d.future
      ? 'Still to come.'
      : `${passes.length ? `Checkout test passed on ${passes.join(' and ')}. ` : ''}No incidents, changes or work logged.${d.speed !== null ? ` Mobile speed score ${d.speed}.` : ''}`;
    if (!d.report.length && !d.future) d.report.push(counts ? `Counts toward ${counts}${sofar}. Nothing to explain, which is the point.` : 'Nothing from this day needs explaining in the report.');
  }
  return days;
}
