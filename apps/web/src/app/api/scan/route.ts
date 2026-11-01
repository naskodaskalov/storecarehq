import { probeStore } from '@storecare/storefront';
import { contactLimiter } from '@/lib/contact';
import { handleScan } from '@/lib/scan';

// Twelve scans per visitor per ten minutes: enough for the hero check plus a five-store portfolio check, twice.
const allow = contactLimiter(Date.now, 12);

export const maxDuration = 30;

export async function POST(request: Request) {
  const address = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return handleScan(request, {
    probe: (url) => probeStore(url, { maxProductPages: 1, gapMs: 250, skipCart: true }),
    allow,
    clientKey: address || 'local',
  });
}
