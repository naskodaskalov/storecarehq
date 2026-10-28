import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = fileURLToPath(new URL('../../../', import.meta.url));

/** Connects to TEST_DATABASE_URL's server, creates a fresh database and applies the stub + migrations. */
export async function freshDb(): Promise<{ pool: pg.Pool; drop: () => Promise<void> } | null> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return null;
  const name = `sc_test_${process.pid}_${Math.floor(Math.random() * 1e6)}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();

  const u = new URL(url);
  u.pathname = `/${name}`;
  const pool = new pg.Pool({ connectionString: u.toString(), max: 3 });
  await pool.query(readFileSync(`${root}supabase/tests/supabase-stub.sql`, 'utf8'));
  for (const f of readdirSync(`${root}supabase/migrations`).filter((f) => f.endsWith('.sql')).sort()) {
    await pool.query(readFileSync(`${root}supabase/migrations/${f}`, 'utf8'));
  }
  return {
    pool,
    drop: async () => {
      await pool.end();
      const a = new pg.Client({ connectionString: url });
      await a.connect();
      await a.query(`drop database if exists ${name} with (force)`);
      await a.end();
    },
  };
}

export async function seedStore(pool: pg.Pool, over: Record<string, unknown> = {}) {
  const { rows: [agency] } = await pool.query<{ id: string }>(`insert into public.agencies (name, plan, subscription_status) values ('Northline Studio', 'agency', 'active') returning id`);
  const cols = { agency_id: agency.id, name: 'Juniper & Ash', public_url: 'https://juniperandash.com', ...over };
  const keys = Object.keys(cols);
  const { rows: [store] } = await pool.query(
    `insert into public.stores (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
    Object.values(cols),
  );
  return store;
}
