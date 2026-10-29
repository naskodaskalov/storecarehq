import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase';
import { SubmitButton } from '@/components/submit-button';
import { isDemo } from '@/lib/demo';
import Link from 'next/link';
import { Icon } from '@/components/icon';

async function sendLink(formData: FormData) {
  'use server';
  const email = String(formData.get('email') ?? '').trim();
  if (!email) redirect('/login?error=email');
  if (isDemo()) redirect('/login?error=' + encodeURIComponent('Email sign-in is not configured yet. Please try again later.'));
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback` },
  });
  redirect(error ? `/login?error=${encodeURIComponent(error.message)}` : `/login?sent=${encodeURIComponent(email)}`);
}

export default async function Login({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string; trial?: string; signed_out?: string }> }) {
  const { sent, error, trial, signed_out } = await searchParams;
  return (
    <main className="login-shell">
      <aside className="login-story" aria-label="About StoreCare HQ">
        <Link href="/welcome" className="brand"><span className="mark">SC</span>StoreCare HQ</Link>
        <div className="login-story-content">
          <span className="login-eyebrow">BUILT FOR SHOPIFY AGENCIES</span>
          <h2>Great care.<br /><span>Clearly shown.</span></h2>
          <p>Keep an eye on every storefront.<br />Show clients the value behind your work.</p>
          <div className="login-preview" aria-label="Illustration of storefront monitoring">
            <div className="login-preview-heading"><span><span className="login-live-dot" />Your stores, in good hands</span><span>Store overview</span></div>
            {[['JA', 'Juniper & Ash', '94'], ['BB', 'Bloom Botanics', '96'], ['KK', 'Kite & Kin', '97']].map(([initials, name, score], index) => <div className="login-preview-row" key={name}><span className={`store-avatar avatar-${index}`}>{initials}</span><strong>{name}</strong><span className="login-preview-status"><Icon name="check" size={13} />{score} Healthy</span></div>)}
            <div className="login-preview-report"><span className="login-report-icon"><Icon name="report" size={20} /></span><div><strong>A month of care, made visible.</strong><span>Your branded report is ready to review.</span></div><Icon name="arrow" size={18} /></div>
          </div>
          <div className="login-story-features"><span><Icon name="check" size={14} />Storefront monitoring</span><span><Icon name="check" size={14} />Client-ready reports</span></div>
        </div>
        <div className="login-story-footer">Behind every thriving store is a team that cares.</div>
      </aside>
      <section className="login-entry" aria-labelledby="login-title">
        <header className="login-entry-top"><Link href="/welcome">← Back to StoreCare</Link><span className="demo-badge">DEMO</span></header>
        <div className="login-form-content">
        <span className="login-form-kicker">YOUR AGENCY WORKSPACE</span>
        <h1 id="login-title">{sent ? 'Check your inbox.' : trial ? 'Better care starts here.' : 'Welcome back.'}</h1>
        <p className="login-description">{sent ? 'Your sign-in link is on its way.' : trial ? 'Create your workspace and start your 7-day free trial.' : 'A clear view of your stores. A little peace of mind.'}</p>
        {signed_out && !sent && <div className="login-feedback" role="status"><Icon name="check" size={16} />You&apos;ve been signed out successfully.</div>}
        {!sent && <div className="login-divider"><span>SIGN IN WITH YOUR EMAIL</span></div>}
        {sent ? (
          <div className="login-sent" role="status"><span className="login-sent-icon"><Icon name="check" size={25} /></span><p>We sent a sign-in link to <strong>{sent}</strong>. Open it on this device to continue.</p><Link className="btn secondary" href={trial ? '/login?trial=1' : '/login'}>Use a different email</Link></div>
        ) : (
          <form action={sendLink} className="login-form">
            <div className="field">
              <label htmlFor="email">Work email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="you@agency.com" aria-describedby="login-email-note" />
            </div>
            {error && <div className="error" role="alert">{error === 'email' ? 'Enter your email.' : error}</div>}
            <SubmitButton pendingText="Sending link…">Email me a sign-in link <Icon name="arrow" size={17} /></SubmitButton>
            <p id="login-email-note" className="login-email-note">No password to remember. Just a secure link to your inbox.</p>
          </form>
        )}
        {!trial && <p className="login-signup-note">New to StoreCare? <Link href="/login?trial=1">Start your free trial <span aria-hidden="true">→</span></Link></p>}
        {trial && !sent && <p className="login-signup-note">Already have an account? <Link href="/login">Sign in</Link></p>}
        </div>
        <footer className="login-entry-footer"><span>StoreCare HQ</span><span>Made for the teams behind the stores.</span></footer>
      </section>
    </main>
  );
}
