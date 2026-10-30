import type pg from 'pg';
import type { Db } from './db.ts';

/** A dedicated connection holds the lock across network calls; all work uses that connection. */
export async function withStoreLock<T>(pool: pg.Pool, storeId: string, run: (db: Db) => Promise<T>): Promise<{ acquired: false } | { acquired: true; value: T }> {
  const client = await pool.connect();
  let locked = false;
  let damaged = false;
  try {
    const { rows } = await client.query('select pg_try_advisory_lock(hashtextextended($1,196307)) as locked', [storeId]);
    locked = rows[0].locked;
    if (!locked) return { acquired: false };
    return { acquired: true, value: await run(client) };
  } finally {
    if (locked) {
      try { await client.query('select pg_advisory_unlock(hashtextextended($1,196307))',[storeId]); }
      catch { damaged = true; }
    }
    client.release(damaged);
  }
}
