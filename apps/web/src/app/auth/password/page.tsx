import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { PasswordField } from '@/components/password-field';
import { SubmitButton } from '@/components/submit-button';
import { supabaseServer } from '@/lib/supabase';
import { updatePassword } from '../password-actions';

export default async function SetPassword({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const { error, saved } = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return <AuthShell>
    <span className="login-form-kicker">ACCOUNT SECURITY</span>
    <h1 id="login-title">{!user ? 'Your link has expired.' : saved ? 'Password saved.' : 'Set your password.'}</h1>
    {!user ? <>
      <p className="login-description">Request a new reset link and open it in this browser, or sign in to set your password.</p>
      <Link className="btn" href="/auth/forgot-password">Request a reset link</Link>
      <p className="login-signup-note"><Link href="/login">Back to sign in</Link></p>
    </> : saved ? <div role="status">
      <p className="login-description">You can now sign in with your email and password.</p><Link className="btn" href="/">Go to your workspace</Link>
    </div> : <>
      <p className="login-description">Choose a unique password with at least 8 characters. You’ll stay signed in on this device.</p>
      {error && <div className="error" role="alert">{error}</div>}
      <form action={updatePassword} className="login-form">
        <input type="text" name="username" value={user.email ?? ''} readOnly autoComplete="username" aria-label="Account email" />
        <PasswordField label="New password" autoComplete="new-password" minLength={8} />
        <PasswordField name="confirmation" label="Confirm password" autoComplete="new-password" minLength={8} />
        <SubmitButton pendingText="Saving password…">Save password</SubmitButton>
      </form>
      <p className="login-signup-note"><Link href="/">Back to workspace</Link> · <Link href="/auth/forgot-password">Request a fresh reset link</Link></p>
    </>}
  </AuthShell>;
}
