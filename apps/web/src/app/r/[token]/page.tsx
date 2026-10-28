// The client's view of an approved report. No login: the 64-character token in the link is the key,
// and the database only returns approved or sent reports for it (public.public_report).

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { DEFAULT_SECTIONS, type Facts, type Sections } from '@storecare/reports';
import { supabaseServer } from '@/lib/supabase';
import { ReportView } from '@/components/report-view';
import { PrintButton } from '@/components/copy-button';

type Public = {
  summary_text: string | null;
  facts: Facts;
  sections: Partial<Sections> | null;
  store_name: string;
  agency_name: string;
  logo_url: string | null;
};

async function load(token: string): Promise<Public | null> {
  if (!/^[a-f0-9]{32,128}$/.test(token)) return null;
  const supabase = await supabaseServer();
  const { data } = await supabase.rpc('public_report', { token });
  return (data as Public | null) ?? null;
}

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const r = await load((await params).token);
  return {
    title: r ? `${r.store_name} · ${r.facts.period.label} report` : 'Report',
    robots: { index: false, follow: false },
  };
}

export default async function PublicReport({ params }: { params: Promise<{ token: string }> }) {
  const r = await load((await params).token);
  if (!r) notFound();
  return (
    <main style={{ padding: '32px 16px 56px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div className="no-print" style={{ width: '100%', maxWidth: 820, display: 'flex', justifyContent: 'flex-end' }}>
        <PrintButton />
      </div>
      <ReportView facts={r.facts} summary={r.summary_text ?? ''} sections={{ ...DEFAULT_SECTIONS, ...(r.sections ?? {}) }} logoUrl={r.logo_url} />
    </main>
  );
}
