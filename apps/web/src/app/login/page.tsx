import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { SubmitButton } from '@/components/submit-button';

async function sendLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  if (!email) redirect('/login?error=email');
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : `/login?sent=${encodeURIComponent(email)}`);
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; trial?: string }> }) {
  const { sent, error, trial } = await searchParams;
  return (
    <div className="onb">
      <div className="onb-top">
        <a href="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}><div className="mark">SC</div>StoreCare HQ</a>
      </div>
      <section className="onb-card" style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: 28 }}>{trial ? 'Start your free trial' : 'Sign in'}</h1>
        {trial && !sent && <p className="muted" style={{ margin: 0 }}>Enter your work email and we&apos;ll send a link that creates your account. Then pick a plan: the first 7 days are free.</p>}
        {sent ? (
          <p>We sent a sign-in link to <strong>{sent}</strong>. Open it on this device.</p>
        ) : (
          <form action={sendLink} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            {error && <div className="error">{error === 'email' ? 'Enter your email.' : error}</div>}
            <SubmitButton pendingText="Sending link…">Email me a sign-in link</SubmitButton>
          </form>
        )}
        {!trial && <p className="small muted">New here? The same link creates your account. Every plan starts with 7 days free.</p>}
      </section>
    </div>
  );
}
