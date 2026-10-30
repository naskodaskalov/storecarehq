import { contactLimiter, handleContact } from '@/lib/contact';

const allow = contactLimiter();

export async function POST(request: Request) {
    const address = process.env.VERCEL === '1' ? request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() : undefined;
    return handleContact(request, {
        apiKey: process.env.RESEND_API_KEY,
        to: process.env.CONTACT_TO,
        from: process.env.CONTACT_FROM || process.env.REPORTS_FROM,
        allow,
        clientKey: address || 'local',
    });
}