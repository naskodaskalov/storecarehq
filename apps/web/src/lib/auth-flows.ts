import type { SupabaseClient } from '@supabase/supabase-js';

type Auth = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signInWithOtp' | 'signUp' | 'resetPasswordForEmail' | 'getUser' | 'updateUser'>;
export const PASSWORD_MIN = 8;
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN || password.length > 128) return 'Use between 8 and 128 characters for your password.';
  if (password !== confirmation) return 'Your passwords do not match.';
  return null;
}
export function validEmail(email: string) { return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
export function authMessage(error: { code?: string } | null, fallback: string): string {
  if (error?.code === 'over_request_rate_limit' || error?.code === 'over_email_send_rate_limit') return 'Too many attempts. Please wait a little before trying again.';
  if (error?.code === 'email_not_confirmed') return 'Confirm your email before signing in. Check your inbox for the verification email.';
  if (error?.code === 'weak_password') return 'Choose a stronger password. A longer, unique passphrase works well.';
  if (error?.code === 'same_password') return 'Choose a password different from your current one.';
  if (error?.code === 'reauthentication_needed') return 'Please request a fresh password reset link before changing your password.';
  return fallback;
}

/** These flows use the user's Supabase client, never an administrator client. */
export async function loginWithPassword(auth: Auth, email: string, password: string) {
  if (!validEmail(email) || !password || password.length > 1024) return 'Enter your email and password.';
  const { error } = await auth.signInWithPassword({ email, password });
  return error ? authMessage(error, 'The email or password is incorrect. Try again or reset your password.') : null;
}
export async function registerWithPassword(auth: Auth, email: string, password: string, confirmation: string, callback: string) {
  if (!validEmail(email)) return 'Enter a valid work email.';
  const problem = passwordProblem(password, confirmation);
  if (problem) return problem;
  const { error } = await auth.signUp({ email, password, options: { emailRedirectTo: callback } });
  return error ? authMessage(error, 'Could not create your account. Try signing in or resetting your password if you already have one.') : null;
}
export async function requestRecovery(auth: Auth, email: string, callback: string) {
  if (!validEmail(email)) return 'Enter a valid work email.';
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo: callback });
  // Do not reveal whether an email has an account.
  if (error?.code === 'user_not_found') return null;
  return error ? authMessage(error, 'Could not send the reset email. Please try again shortly.') : null;
}
export async function requestMagicLink(auth: Auth, email: string, callback: string) {
  if (!validEmail(email)) return 'Enter a valid work email.';
  const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo: callback, shouldCreateUser: false } });
  // Unknown accounts receive the same response, avoiding account enumeration.
  if (error?.code === 'otp_disabled' || error?.code === 'user_not_found' || error?.code === 'signup_disabled') return null;
  return error ? authMessage(error, 'Could not send the sign-in email. Please try again shortly.') : null;
}
export async function savePassword(auth: Auth, password: string, confirmation: string) {
  const problem = passwordProblem(password, confirmation);
  if (problem) return problem;
  const { data: { user }, error: userError } = await auth.getUser();
  if (userError || !user) return 'Your session has expired. Request a fresh reset link and open it in this browser.';
  const { error } = await auth.updateUser({ password });
  return error ? authMessage(error, 'Could not update your password. Request a fresh reset link and try again.') : null;
}
