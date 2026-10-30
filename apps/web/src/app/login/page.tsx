import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { PasswordField } from '@/components/password-field';
import { SubmitButton } from '@/components/submit-button';
import { signInPassword, signUpPassword, sendSignInLink } from '@/app/auth/password-actions';
import { supabaseServer } from '@/lib/supabase';
import { redirect } from 'next/navigation';

export default async function Login({ searchParams }: {
  searchParams: Promise<{ sent?: string; error?: string; trial?: string; signed_out?: string; method?: string; verify?: string }>;
}) {
  const q = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (user && !q.error && !q.verify && !q.sent) redirect('/');
  const signup = q.trial === '1';
  const link = !signup && q.method === 'link';
  const sent = link && q.sent;
  return <AuthShell>
    <span className="login-form-kicker">YOUR AGENCY WORKSPACE</span>
    <h1 id="login-title">{q.verify ? 'Confirm your email.' : sent ? 'Check your inbox.' : signup ? 'Better care starts here.' : 'Welcome back.'}</h1>
    <p className="login-description">{signup ? 'Create your account, then set up your agency workspace and free trial.' : 'A clear view of your stores. A little peace of mind.'}</p>
    {q.signed_out && <div className="login-feedback" role="status">You&apos;ve been signed out successfully.</div>}
    {q.error && <div className="error" role="alert">{q.error}</div>}
    {q.verify ? <div className="login-sent" role="status">
      <p>If your account needs verification, we&apos;ve sent an email. Open the link in this browser to continue. Already have an account? Sign in or reset your password.</p>
      <Link className="btn secondary" href="/login">Back to sign in</Link>
    </div> : sent ? <div className="login-sent" role="status">
      <p>If there&apos;s an account for that address, a sign-in link is on its way. Open it in this browser to continue.</p>
      <Link className="btn secondary" href="/login?method=link">Try another email</Link>
    </div> : <>
      <div className="login-divider"><span>{signup ? 'CREATE YOUR ACCOUNT' : link ? 'SIGN IN WITH AN EMAIL LINK' : 'SIGN IN TO YOUR WORKSPACE'}</span></div>
      <form action={signup ? signUpPassword : link ? sendSignInLink : signInPassword} className="login-form">
        <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="username" placeholder="you@agency.com" /></div>
        {!link && <PasswordField autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} />}
        {signup && <><PasswordField name="confirmation" label="Confirm password" autoComplete="new-password" minLength={8} /><p className="login-email-note">Use at least 8 characters. Password managers and long passphrases are welcome.</p></>}
        {!signup && !link && <Link className="auth-text-link" href="/auth/forgot-password">Forgot or set password?</Link>}
        <SubmitButton pendingText={signup ? 'Creating account…' : link ? 'Sending link…' : 'Signing in…'}>{signup ? 'Create account' : link ? 'Email me a sign-in link' : 'Sign in'}</SubmitButton>
        {!signup && <Link className="auth-alternative" href={link ? '/login' : '/login?method=link'}>{link ? 'Sign in with a password' : 'Email me a sign-in link instead'}</Link>}
      </form>
    </>}
    <p className="login-signup-note">{signup ? <>Already have an account? <Link href="/login">Sign in</Link></> : <>New to StoreCare? <Link href="/login?trial=1">Start your free trial →</Link></>}</p>
  </AuthShell>;
}
