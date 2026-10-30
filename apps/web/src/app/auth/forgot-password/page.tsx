import Link from 'next/link';
import { AuthShell } from '@/components/auth-shell';
import { SubmitButton } from '@/components/submit-button';
import { sendPasswordReset } from '../password-actions';

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  return <AuthShell>
    <span className="login-form-kicker">ACCOUNT ACCESS</span>
    <h1 id="login-title">{sent ? 'Check your inbox.' : 'A fresh start.'}</h1>
    <p className="login-description">{sent ? 'If an account exists for that email, a password reset link is on its way. Open it in this browser.' : 'Reset your password, or create one if you’ve always used email links.'}</p>
    {error && <div className="error" role="alert">{error}</div>}
    {!sent && <form action={sendPasswordReset} className="login-form">
      <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="username" maxLength={254} required placeholder="you@agency.com" /></div>
      <SubmitButton pendingText="Sending link…">Send password reset link</SubmitButton>
    </form>}
    <p className="login-signup-note"><Link href="/login">Back to sign in</Link>{sent && <> · <Link href="/auth/forgot-password">Try again</Link></>}</p>
  </AuthShell>;
}
