# Password authentication

The default `/login` screen uses email/password sign-in. `/login?trial=1` registers new accounts
and sends Supabase's verification email. `/login?method=link` preserves optional magic-link
sign-in for existing accounts without silently registering a new user.

`/auth/forgot-password` lets existing magic-link users set a password or password users reset it.
Supabase sends the recovery email to the existing `/auth/callback` redirect. A one-hour,
HTTP-only, SameSite=Lax cookie records that this browser requested password recovery, and the
callback sends a successful PKCE exchange to `/auth/password`. This avoids expanding the
project's redirect allowlist. Request and open links in the same browser; PKCE requires its
verifier cookie. The callback clears the intent and rejects missing/invalid codes. Arbitrary
`next` query parameters are ignored.

Signed-in users can also choose **Set or change password** in the workspace sidebar. Password
updates verify the current user using Supabase Auth before updating. No administrator key is
used. New passwords require matching confirmation and 8–128 characters; existing passwords
can still be used to sign in even if they are shorter. Passwords are not trimmed or logged.
Show/hide controls, correct autocomplete attributes, and paste support allow password managers.

Reset requests and unknown email-link accounts use neutral confirmation text. Rate limits,
unconfirmed emails and weak passwords have readable errors; provider internals are not shown.
Supabase remains responsible for email verification, hashing, token expiry, refresh and revocation.

Sessions use the existing persistent Supabase SSR cookies. Middleware now preserves refreshed
cookies on redirects/rewrites. Signed-in users visiting the ordinary login screen go directly
to their workspace. Logout still clears the current device's session.

## Verification

On 30 October 2026 the live Supabase public Auth settings confirmed email authentication is
enabled, signup is allowed, and automatic email confirmation is disabled (verification required).
The existing production and localhost:3101 `/auth/callback` entries are reused. No new backend
auth settings, users, passwords or email templates were changed.

All 13 web tests pass (including seven authentication flow tests) and the production build passes.
Login, registration and reset screens were checked in the local browser. Tests cover password
handling, signup confirmation, recovery callback arguments, expired sessions, existing users,
account enumeration, and safe error messages. No real verification/reset emails were sent and
no real account password was changed during testing. The user should complete their own
recovery/set-password flow for the final email-provider and browser-session check.

Deploy the application changes for production to use these screens. Existing accounts and
their agency memberships are preserved; users can adopt passwords individually.
