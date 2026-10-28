import pg from 'pg';

export type Db = Pick<pg.Pool, 'query'>;

/** Connection settings shared by the pool and pg-boss.
 *  Remote databases (Supabase) get TLS. Supabase's server certificate is not in Node's default trust store,
 *  so set DATABASE_CA_CERT to its CA (Project settings → Database → SSL) to verify it; without it the
 *  connection is still encrypted but the certificate is not checked. Local databases connect without TLS. */
export function dbConfig(url = process.env.DATABASE_URL): { connectionString: string; ssl?: pg.ConnectionConfig['ssl'] } {
  if (!url) throw new Error('DATABASE_URL is not set');
  const u = new URL(url);
  const local = ['localhost', '127.0.0.1', ''].includes(u.hostname) || u.searchParams.has('host');
  if (local) return { connectionString: url };
  // pg treats sslmode in the URL as "verify-full" and would ignore the ssl object below.
  u.searchParams.delete('sslmode');
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  return { connectionString: u.toString(), ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false } };
}

export function createPool(url = process.env.DATABASE_URL): pg.Pool {
  return new pg.Pool({ ...dbConfig(url), max: 5 });
}

export type StoreRow = {
  id: string;
  agency_id: string;
  name: string;
  public_url: string;
  status: 'active' | 'limited' | 'paused';
  limited_reason: string | null;
  timezone: string;
  checkout_consent_at: Date | null;
  checkout_product_handle: string | null;
  checkout_mobile: boolean;
  checkout_desktop: boolean;
};

export async function activeStores(db: Db): Promise<StoreRow[]> {
  const { rows } = await db.query<StoreRow>(`select * from public.stores where status <> 'paused' order by created_at`);
  return rows;
}

export async function getStore(db: Db, id: string): Promise<StoreRow | null> {
  const { rows } = await db.query<StoreRow>(`select * from public.stores where id = $1`, [id]);
  return rows[0] ?? null;
}
