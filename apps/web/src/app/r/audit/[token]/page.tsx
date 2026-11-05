// The client's view of a shared BFCM one-pager. No login: the 64-character token in the link is the key,
// and the database returns the audit only while the agency has the link turned on (public.public_audit).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { validAudit, type BfcmAudit } from '@/lib/bfcm';
import { BfcmOnePager } from '@/components/bfcm-one-pager';
import { PrintButton } from '@/components/copy-button';

type Public = { audit: unknown; note: string | null; store_name: string; agency_name: string; brand_color: string | null; logo_url: string | null };

async function load(token: string): Promise<(Public & { audit: BfcmAudit }) | null> {
  if (!/^[a-f0-9]{32,128}$/.test(token)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('public_audit', { token });
  const r = data as Public | null;
  return r && validAudit(r.audit) ? (r as Public & { audit: BfcmAudit }) : null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await load((await params).token);
  return { title: r ? `${r.audit.storeName} · Black Friday readiness` : 'Black Friday readiness', robots: { index: false, follow: false, noarchive: true } };
}

export default async function PublicAudit({ params }: { params: Promise<{ token: string }> }) {
  const r = await load((await params).token);
  if (!r) notFound();
  return (
    <main style={{ padding: '32px 16px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div className="no-print" style={{ width: '100%', maxWidth: 820, display: 'flex', justifyContent: 'flex-end' }}><PrintButton /></div>
      <BfcmOnePager audit={r.audit} brand={{ name: r.agency_name, brandColor: r.brand_color, logoUrl: r.logo_url }} note={r.note} />
    </main>
  );
}
