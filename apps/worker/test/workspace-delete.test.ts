import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { freshDb, seedStore } from './helpers.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });

// Settings → "Delete this workspace" deletes the agency row and relies on cascades for everything else.
test('deleting an agency removes all of its data and nothing of other agencies', { skip: !db }, async () => {
  const q = (sql: string, args: unknown[] = []) => db!.pool.query(sql, args);
  const keep = await seedStore(db!.pool);
  const s = await seedStore(db!.pool);
  const user = randomUUID();
  await q('insert into auth.users(id,email) values($1,$2)', [user, `${user}@example.com`]);
  await q("insert into public.memberships(agency_id,user_id,role) values($1,$2,'owner')", [s.agency_id, user]);
  await q('insert into public.care_plans(store_id,agency_id,hours_included) values($1,$2,10)', [s.id, s.agency_id]);
  await q("insert into public.alert_routes(agency_id,channel,target) values($1,'email','ops@example.com')", [s.agency_id]);
  const w = (await q("insert into public.work_entries(store_id,agency_id,user_id,minutes,title) values($1,$2,$3,30,'Fix') returning id", [s.id, s.agency_id, user])).rows[0].id;
  await q("insert into public.changes(store_id,agency_id,kind,summary,work_entry_id) values($1,$2,'app_added','Klaviyo added',$3)", [s.id, s.agency_id, w]);
  await q("insert into public.incidents(store_id,agency_id,kind) values($1,$2,'down')", [s.id, s.agency_id]);
  await q("insert into public.uptime_checks(store_id,agency_id,ok) values($1,$2,true)", [s.id, s.agency_id]);
  await q("insert into public.reports(store_id,agency_id,period,approved_by) values($1,$2,'2026-10-01',$3)", [s.id, s.agency_id, user]);

  await q('delete from public.agencies where id = $1', [s.agency_id]);

  const tables = ['stores', 'memberships', 'care_plans', 'alert_routes', 'work_entries', 'changes', 'incidents', 'uptime_checks', 'reports', 'health_check_requests', 'alert_deliveries'];
  for (const t of tables) {
    const { rows } = await q(`select count(*)::int as n from public.${t} where agency_id = $1`, [s.agency_id]);
    assert.equal(rows[0].n, 0, `${t} left behind`);
  }
  assert.equal((await q('select count(*)::int as n from public.stores where id = $1', [keep.id])).rows[0].n, 1);
  // With the workspace gone, the user's sign-in account can be deleted too (approved_by no longer blocks it).
  await q('delete from auth.users where id = $1', [user]);
});
