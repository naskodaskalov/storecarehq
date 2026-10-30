import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: 'Store unavailable.' }, { status: 404, headers });
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to continue.' }, { status: 401, headers });
  const { data, error } = await supabase.from('health_check_requests').select('id,source,status,requested_at,started_at,finished_at,phase,results')
    .eq('store_id',id).order('requested_at',{ ascending: false }).limit(1).maybeSingle();
  if (error) return NextResponse.json({ error: 'Could not refresh health check progress.' }, { status: 503, headers });
  return NextResponse.json({ scan: data }, { headers });
}
