import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { outreachEmail, validateTestEmail, type TestEmailInput } from './outreach-email.ts';
import { sampleMonthReport } from './sample-month-report.ts';
import { APP_ORIGIN } from './domains.ts';
import type { ReportLinks } from './outreach.ts';
import type { QuickReport } from './quick-report.ts';

type Health = Pick<Extract<QuickReport, { ok: true }>, 'host' | 'checkedAt' | 'sections'>;
export type Snapshot = { health: Health; sample: ReturnType<typeof sampleMonthReport>; documents: { filename: string; html: string }[] };
export type SnapshotRow = { id: string; owner_email: string; health_hash: string; sample_hash: string; source_digest: string; snapshot: Snapshot; created_at: string; expires_at: string; revoked_at: string | null };
export interface ReportStore {
  insert(row: SnapshotRow): Promise<void>;
  byId(id: string): Promise<SnapshotRow | null>;
  byHash(hash: string): Promise<SnapshotRow | null>;
  revoke(id: string, owner: string, at: string): Promise<void>;
}
export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const validToken = (token: string) => /^[a-f0-9]{64}$/.test(token);
const alive = (row: SnapshotRow, now: number) => !row.revoked_at && Number.isFinite(Date.parse(row.expires_at)) && Date.parse(row.expires_at) > now;

export function reportOrigin(value = process.env.NEXT_PUBLIC_APP_URL || APP_ORIGIN) {
  const u = new URL(value);
  if (u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))) throw new Error('Configure a secure app URL for report links.');
  return u.origin;
}

export function buildSnapshot(input: TestEmailInput): Snapshot {
  const { pack } = validateTestEmail(input);
  if (!pack.report?.ok) throw new Error('Prepare the health check first.');
  return { health: { host: pack.report.host, checkedAt: pack.report.checkedAt, sections: pack.report.sections },
    sample: sampleMonthReport(pack.prospect.agency_name, pack.preparedAt || pack.report.checkedAt), documents: outreachEmail(input).documents };
}
const snapshotDigest = (snapshot: Snapshot) => tokenHash(JSON.stringify(snapshot));

export async function publishReportLinks(input: TestEmailInput, owner: string, store: ReportStore, origin = reportOrigin(), now = Date.now()): Promise<ReportLinks> {
  const snapshot = buildSnapshot(input);
  const healthToken = randomBytes(32).toString('hex'), sampleToken = randomBytes(32).toString('hex');
  const links = { id: randomUUID(), healthToken, sampleToken, sourceDigest: snapshotDigest(snapshot), origin: reportOrigin(origin), expiresAt: new Date(now + 30 * 86400_000).toISOString() };
  await store.insert({ id: links.id, owner_email: owner.toLowerCase(), health_hash: tokenHash(healthToken), sample_hash: tokenHash(sampleToken), source_digest: links.sourceDigest, snapshot, created_at: new Date(now).toISOString(), expires_at: links.expiresAt, revoked_at: null });
  return links;
}

export async function requireSavedReports(input: TestEmailInput, owner: string, store: ReportStore, origin = reportOrigin(), now = Date.now()) {
  const normalized = validateTestEmail(input), links = normalized.pack.links;
  if (!links) throw new Error('Create report links before approving or sending.');
  const row = await store.byId(links.id);
  if (!row || row.owner_email !== owner.toLowerCase() || !alive(row, now) || links.origin !== reportOrigin(origin) || Date.parse(links.expiresAt) !== Date.parse(row.expires_at) || !validToken(links.healthToken) || !validToken(links.sampleToken) || tokenHash(links.healthToken) !== row.health_hash || tokenHash(links.sampleToken) !== row.sample_hash || links.sourceDigest !== row.source_digest || snapshotDigest(buildSnapshot(normalized)) !== row.source_digest) throw new Error('Report links changed, expired, were revoked, or belong to another admin. Create new links and approve again.');
  return normalized;
}

export async function readPublicReport(token: string, store: ReportStore, now = Date.now()) {
  if (!validToken(token)) return null;
  const hash = tokenHash(token), row = await store.byHash(hash);
  if (!row || !alive(row, now)) return null;
  const kind = row.health_hash === hash ? 'health' : row.sample_hash === hash ? 'sample' : null;
  if (!kind) return null;
  // Explicit projection: never expose an owner, contact, draft or the other report token.
  return kind === 'health'
    ? { kind, health: row.snapshot.health, document: row.snapshot.documents[0], expiresAt: row.expires_at } as const
    : { kind, sample: row.snapshot.sample, document: row.snapshot.documents[1], expiresAt: row.expires_at } as const;
}

export async function revokeReportLinks(id: string, owner: string, store: ReportStore, now = Date.now()) {
  const row = await store.byId(id);
  if (!row || row.owner_email !== owner.toLowerCase()) throw new Error('Report links could not be found for this admin.');
  await store.revoke(id, owner.toLowerCase(), new Date(now).toISOString());
}

// Demo-only storage lets local browser tests exercise public routes without production writes.
export function memoryReportStore(rows = new Map<string, SnapshotRow>()): ReportStore {
  return {
    async insert(row) { if (rows.has(row.id)) throw new Error('Duplicate report.'); rows.set(row.id, structuredClone(row)); },
    async byId(id) { const row = rows.get(id); return row ? structuredClone(row) : null; },
    async byHash(hash) { const row = [...rows.values()].find(r => r.health_hash === hash || r.sample_hash === hash); return row ? structuredClone(row) : null; },
    async revoke(id, owner, at) { const row = rows.get(id); if (row?.owner_email === owner) row.revoked_at ||= at; },
  };
}

export async function reportStore(): Promise<ReportStore> {
  if (process.env.STORECARE_DEMO === '1') {
    const scope = globalThis as typeof globalThis & { storecareOutreachReports?: Map<string, SnapshotRow> };
    scope.storecareOutreachReports ||= new Map();
    return memoryReportStore(scope.storecareOutreachReports);
  }
  const { supabaseAdmin } = await import('./supabase-admin.ts');
  const client = supabaseAdmin();
  const columns = 'id,owner_email,health_hash,sample_hash,source_digest,snapshot,created_at,expires_at,revoked_at';
  const problem = () => new Error('Report storage is unavailable. Check the report-links migration and server credentials.');
  return {
    async insert(row) { const { error } = await client.from('outreach_report_snapshots').insert(row); if (error) throw problem(); },
    async byId(id) { const { data, error } = await client.from('outreach_report_snapshots').select(columns).eq('id', id).maybeSingle(); if (error) throw problem(); return data as SnapshotRow | null; },
    async byHash(hash) { const { data, error } = await client.from('outreach_report_snapshots').select(columns).or(`health_hash.eq.${hash},sample_hash.eq.${hash}`).maybeSingle(); if (error) throw problem(); return data as SnapshotRow | null; },
    async revoke(id, owner, at) { const { error } = await client.from('outreach_report_snapshots').update({ revoked_at: at }).eq('id', id).eq('owner_email', owner).is('revoked_at', null); if (error) throw problem(); },
  };
}
