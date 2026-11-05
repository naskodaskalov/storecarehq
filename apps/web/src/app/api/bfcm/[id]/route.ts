import { NextResponse } from 'next/server';
import { isProductionHost } from '@/lib/domains';
import { runAudit } from '@/lib/bfcm-run';

// One live visit per store: robots.txt, the home page and up to three product pages, 10 seconds each at most.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const headers = { 'Cache-Control': 'private, no-store' };
  // Same-origin only: the session cookie alone must not let another site start audits.
  const url = new URL(request.url);
  const host = request.headers.get('host') ?? url.host;
  if (request.headers.get('origin') !== `${isProductionHost(host) ? 'https:' : url.protocol}//${host}`) {
    return NextResponse.json({ ok: false, error: 'Run the audit from StoreCare HQ.' }, { status: 403, headers });
  }
  const { status, body } = await runAudit((await params).id);
  return NextResponse.json(body, { status, headers });
}
