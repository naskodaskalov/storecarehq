import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { freshDb } from './helpers.ts';

const db = await freshDb();
after(async () => { if (db) await db.drop(); });
const options = { skip: !db };

const row = (over: Record<string, unknown> = {}) => ({
  sent_by: 'admin@storecarehq.com', agency_name: 'Northline Studio', agency_domain: 'northline.studio',
  agency_url: 'https://northline.studio/', contact_email: 'hello@northline.studio', subject: 'A sample care report',
  body_text: 'Hi team', delivery: 'accepted', provider_message_id: 'msg_1', payload_digest: 'a'.repeat(64), ...over,
});

/** Runs fn as the given role in a transaction that is always rolled back. */
async function as<T>(role: string, fn: (q: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>) {
  const c = await db!.pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${role}`);
    return await fn((sql, values) => c.query(sql, values));
  } finally {
    await c.query('rollback');
    c.release();
  }
}

function insertSql(r: Record<string, unknown>) {
  const keys = Object.keys(r);
  return { sql: `insert into public.outreach_contacts (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`, values: Object.values(r) };
}

test('browser roles cannot read or write outreach history', options, async () => {
  for (const role of ['anon', 'authenticated']) {
    await as(role, async (q) => {
      await assert.rejects(q('select * from public.outreach_contacts'), /permission denied/);
    });
    await as(role, async (q) => {
      const { sql, values } = insertSql(row());
      await assert.rejects(q(sql, values), /permission denied/);
    });
  }
});

test('the service role records a send, upgrades its delivery, and cannot rewrite it', options, async () => {
  await as('service_role', async (q) => {
    const { sql, values } = insertSql(row({ delivery: 'unconfirmed', provider_message_id: null }));
    const [saved] = (await q(sql, values)).rows;
    assert.equal(saved.delivery, 'unconfirmed');
    assert.ok(saved.sent_at instanceof Date);
    await q("update public.outreach_contacts set delivery = 'accepted', provider_message_id = 'msg_2' where id = $1", [saved.id]);
    assert.equal((await q('select delivery from public.outreach_contacts where id = $1', [saved.id])).rows[0].delivery, 'accepted');
    await assert.rejects(q("update public.outreach_contacts set contact_email = 'other@x.com' where id = $1", [saved.id]), /permission denied/);
  });
  await as('service_role', async (q) => {
    await assert.rejects(q('delete from public.outreach_contacts'), /permission denied/);
  });
});

test('one row per identical email, normalized addresses and known delivery states only', options, async () => {
  await as('service_role', async (q) => {
    const first = insertSql(row());
    await q(first.sql, first.values);
    await assert.rejects(q(first.sql, first.values), /duplicate key/);
  });
  for (const bad of [{ contact_email: 'Hello@Northline.studio' }, { agency_domain: 'Northline.Studio' }, { delivery: 'failed' }, { payload_digest: 'xyz' }]) {
    await as('service_role', async (q) => {
      const { sql, values } = insertSql(row(bad));
      await assert.rejects(q(sql, values), /violates check constraint/);
    });
  }
});
