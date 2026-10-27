import pg from 'pg';

export type Db = Pick<pg.Pool, 'query'>;

export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new pg.Pool({ connectionString, max: 5 });
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
