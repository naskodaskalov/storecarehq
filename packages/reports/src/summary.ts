// The three-sentence summary at the top of the report: written by Claude from the facts only,
// or from a fixed template when no API key is set or the call fails.

import type { Facts } from './types.ts';

export const SUMMARY_MODEL = 'claude-haiku-5-5';

/** The facts the summary may use, as compact text. Stored with the report so every sentence can be traced. */
export function factsForPrompt(f: Facts): string {
  const lines = [
    `Store: ${f.storeName} (${f.storeHost})`,
    `Period: ${f.period.label}`,
    f.uptimePct !== null ? `Uptime: ${f.uptimePct}% across ${f.uptimeChecks} checks` : 'Uptime: not measured',
    f.incidents.length
      ? `Incidents: ${f.incidents.map((i) => `${i.when} ${i.title.toLowerCase()}${i.minutesToFix ? `, fixed in ${i.minutesToFix} min` : i.resolved ? ', resolved' : ', still open'}`).join('; ')}`
      : 'Incidents: none',
    f.checkout ? `Checkout test: ${f.checkout.passed} of ${f.checkout.runs} daily runs passed${f.checkout.failed ? `, ${f.checkout.failed} failed` : ''}` : 'Checkout test: not running',
    f.speed?.lcpEnd ? `Mobile load (largest content): ${(f.speed.lcpEnd / 1000).toFixed(1)}s${f.speed.lcpStart && f.speed.lcpStart !== f.speed.lcpEnd ? `, was ${(f.speed.lcpStart / 1000).toFixed(1)}s at the start of the month` : ''}` : 'Speed: not measured',
    `Changes detected: ${f.changes.total}${f.changes.highlights.length ? ` (${f.changes.highlights.map((c) => c.summary).join('; ')})` : ''}`,
    `Agency work: ${f.work.entries.length} tasks, ${f.work.hoursUsed}h${f.work.hoursIncluded !== null ? ` of ${f.work.hoursIncluded}h included` : ''}${f.work.entries.length ? ` (${f.work.entries.slice(0, 6).map((e) => e.text).join('; ')})` : ''}`,
  ];
  return lines.join('\n');
}

export const SUMMARY_SYSTEM = [
  'You write the opening summary of a monthly care report that a Shopify agency sends to its client, a store owner.',
  'Write exactly three short sentences in plain, friendly English, in the agency\'s voice ("we").',
  'Use only the facts given. Do not invent numbers, causes, plans or promises. If something was not measured, do not mention it.',
  'Sentence 1: overall state of the store this month. Sentence 2: the most important event or work. Sentence 3: what comes next or what to watch.',
  'No greeting, no sign-off, no markdown, no lists.',
].join(' ');

export function templateSummary(f: Facts): string {
  const state =
    f.uptimePct === null
      ? `${f.storeName} was monitored by us throughout ${f.period.label}.`
      : f.incidents.length === 0
        ? `${f.storeName} ran smoothly in ${f.period.label}, with ${f.uptimePct}% uptime and no incidents.`
        : `${f.storeName} was up ${f.uptimePct}% of the time in ${f.period.label}, with ${f.incidents.length} incident${f.incidents.length === 1 ? '' : 's'} that we handled.`;
  const work = f.work.entries.length
    ? `We completed ${f.work.entries.length} task${f.work.entries.length === 1 ? '' : 's'} (${f.work.hoursUsed}h${f.work.hoursIncluded !== null ? ` of ${f.work.hoursIncluded}h in your plan` : ''}), the largest being "${[...f.work.entries].sort((a, b) => b.hours - a.hours)[0].text.replace(/\.$/, '')}".`
    : f.changes.total
      ? `We tracked ${f.changes.total} change${f.changes.total === 1 ? '' : 's'} to the store and checked each one.`
      : 'There were no changes to the store this month.';
  const next = f.recommendations.length
    ? `Our main suggestion for next month: ${f.recommendations[0].title.charAt(0).toLowerCase()}${f.recommendations[0].title.slice(1)}.`
    : 'We will keep watching checkout, speed and changes every day.';
  return [state, work, next].join(' ');
}

export type SummaryResult = { text: string; source: 'ai' | 'template'; error?: string };

export async function writeSummary(
  f: Facts,
  opts: { apiKey?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<SummaryResult> {
  if (!opts.apiKey) return { text: templateSummary(f), source: 'template' };
  try {
    const res = await (opts.fetchImpl ?? fetch)('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20000),
      headers: {
        'content-type': 'application/json',
        'x-api-key': opts.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: SUMMARY_MODEL,
        max_tokens: 300,
        system: SUMMARY_SYSTEM,
        messages: [{ role: 'user', content: `Facts for the report:\n${factsForPrompt(f)}` }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (json.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim();
    if (!text) throw new Error('empty summary');
    return { text, source: 'ai' };
  } catch (e) {
    return { text: templateSummary(f), source: 'template', error: e instanceof Error ? e.message : String(e) };
  }
}
