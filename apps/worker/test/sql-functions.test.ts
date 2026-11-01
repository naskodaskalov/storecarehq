import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Supabase loads pg-safeupdate for every API session: an UPDATE or DELETE without WHERE raises
// "UPDATE requires a WHERE clause", even inside a function the API calls. Plain Postgres (CI) does not
// load it, so the database tests cannot catch this. An unqualified update in the health-check dispatcher
// made every "Run health check" fail once dispatch was enabled.

const root = fileURLToPath(new URL('../../../', import.meta.url));
const FUNCTION = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi;

/** UPDATE or DELETE statements in a function body that have no WHERE clause. */
function unqualifiedDml(body: string): string[] {
  const out: string[] = [];
  for (const statement of body.replace(/--[^\n]*/g, '').split(';')) {
    const dml = statement.match(/\b(update\s+[\w.]+\s+set|delete\s+from\s+[\w.]+)\b/i);
    if (dml && !/\bwhere\b/i.test(statement.slice(dml.index!))) out.push(dml[0]);
  }
  return out;
}

/** The latest definition of every SQL function, after all migrations and the operations setup. */
function latestFunctions(): Map<string, { file: string; body: string }> {
  const files = [
    ...readdirSync(`${root}supabase/migrations`).filter((f) => f.endsWith('.sql')).sort().map((f) => `supabase/migrations/${f}`),
    'scripts/setup-monitor-scheduler.sql',
  ];
  const latest = new Map<string, { file: string; body: string }>();
  for (const file of files) {
    for (const m of readFileSync(`${root}${file}`, 'utf8').matchAll(FUNCTION)) latest.set(m[1].toLowerCase(), { file, body: m[2] });
  }
  return latest;
}

test('the check finds unqualified updates and deletes, including the dispatcher as first shipped', () => {
  const body = `begin
    if x then update storecare_ops.state set last_attempt_at=now(); end if;
    update public.stores set status='paused' where id=p_store;
    select 1 from public.stores for update;
    delete from public.snapshots;
    delete from public.snapshots where taken_at < now() - interval '90 days';
  end`;
  assert.deepEqual(unqualifiedDml(body), ['update storecare_ops.state set', 'delete from public.snapshots']);
  const shipped = readFileSync(`${root}supabase/migrations/20261030132924_health_check_requests.sql`, 'utf8');
  const dispatcher = [...shipped.matchAll(FUNCTION)].find((m) => m[1] === 'storecare_ops.dispatch_health_checks')!;
  assert.deepEqual(unqualifiedDml(dispatcher[2]), ['update storecare_ops.health_check_dispatch_state set']);
});

test('no SQL function updates or deletes without a WHERE clause', () => {
  const functions = latestFunctions();
  assert.ok(functions.size > 10, 'found the functions');
  const offenders = [...functions].flatMap(([name, { file, body }]) => unqualifiedDml(body).map((dml) => `${name} (${file}): ${dml}`));
  assert.deepEqual(offenders, []);
});
