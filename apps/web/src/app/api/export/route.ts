import { NextResponse } from 'next/server';
import { isDemo } from '@/lib/demo';
import { supabaseServer } from '@/lib/supabase';
import { buildExport, EXPORT_AGENCY_COLUMNS, exportFileName } from '@/lib/workspace-data';

export const dynamic = 'force-dynamic';

/** Everything the signed-in member's agency has put into StoreCare HQ, as one JSON file. Read through row-level
 *  security with the member's own session, so it can only ever contain their agency's data. */
export async function GET() {
  const headers = { 'cache-control': 'private, no-store' };
  if (isDemo()) return NextResponse.json({ error: 'Connect a real workspace to export data.' }, { status: 400, headers });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers });
  const { data: agencies } = await supabase.from('agencies').select(`id, ${EXPORT_AGENCY_COLUMNS}`).order('created_at').limit(1);
  const agency = agencies?.[0] as Record<string, unknown> | undefined;
  if (!agency) return NextResponse.json({ error: 'No workspace to export.' }, { status: 404, headers });
  try {
    const out = await buildExport(agency, async (table, columns, from, to) => {
      const { data, error } = await supabase.from(table).select(columns).eq('agency_id', agency.id as string).order(table === 'care_plans' ? 'store_id' : 'id').range(from, to);
      if (error) throw error;
      return (data ?? []) as unknown as Record<string, unknown>[];
    });
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: { ...headers, 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${exportFileName(String(agency.name))}"` },
    });
  } catch {
    return NextResponse.json({ error: 'The export could not be prepared. Please try again.' }, { status: 503, headers });
  }
}
