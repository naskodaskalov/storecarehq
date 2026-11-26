import { contactLimiter } from '@/lib/contact';
import { handleBfcmCheck, runPublicAudit } from '@/lib/bfcm-check';

// Six readiness checks per visitor per ten minutes: each one visits the store, its certificate, its registry and PageSpeed.
const allow = contactLimiter(Date.now, 6);

export const maxDuration = 45;

export async function POST(request: Request) {
  const address = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined;
  return handleBfcmCheck(request, { run: (url) => runPublicAudit(url), allow, clientKey: address || 'local' });
}
