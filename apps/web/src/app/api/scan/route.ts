import { probeStore } from '@storecare/storefront';
import { contactLimiter } from '@/lib/contact';
import { handleScan } from '@/lib/scan';

// Five scans per visitor per ten minutes, same window as the contact form.
const allow = contactLimiter();

export const maxDuration = 30;

export async function POST(request: Request) {
  const address = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return handleScan(request, {
    probe: (url) => probeStore(url, { maxProductPages: 1, gapMs: 250, skipCart: true }),
    allow,
    clientKey: address || 'local',
  });
}
