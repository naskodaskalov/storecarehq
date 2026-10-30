# StoreCare HQ authentication emails

Generated HTML for Supabase Auth:

| File | Dashboard template | Subject |
| --- | --- | --- |
| confirmation.html | Confirm sign up | Confirm your email — StoreCare HQ |
| recovery.html | Reset password | Reset your password — StoreCare HQ |
| magic-link.html | Magic link or OTP | Your sign-in link — StoreCare HQ |

Edit `scripts/build-auth-emails.mjs` and run `node scripts/build-auth-emails.mjs` to regenerate
all three files and `auth-email-config.json`. The JSON contains only the six subject/body
Management API fields; no credentials or unrelated authentication settings.

## Activation status

**Active in the hosted StoreCare HQ project** as of 30 October 2026. Custom SMTP is configured
using Resend with sender `StoreCare HQ <auth@storecarehq.com>`, host `smtp.resend.com`,
port 465 and username `resend`. The dedicated `StoreCare HQ Auth` key has sending-only access
restricted to the verified `storecarehq.com` domain. Its value is stored in Supabase's SMTP
password setting, not in repository files. Existing keys for other projects were preserved.

Confirmation, recovery and magic-link subjects/bodies were saved in Supabase, with the original
`{{ .ConfirmationURL }}` placeholders preserved. A single user-authorized password-reset test
was sent from the local app; Resend reported it Delivered. This confirms SMTP delivery, not
that the recipient opened the email or completed the password change.

`storecarehq.com` is verified in Resend. Vercel DNS contains the Resend DKIM TXT,
`rsend` and `send` CNAME records, and a DMARC monitoring policy. Receiving is disabled.
The existing Auth key was restricted to the new domain without replacing the stored SMTP password.

A separate sending-only `StoreCare HQ App` key, restricted to `storecarehq.com`, is stored
as `RESEND_API_KEY` in Vercel Production and GitHub Actions. Production reports use
`StoreCare HQ <reports@storecarehq.com>`; the monitoring workflow defaults to
`StoreCare HQ <alerts@storecarehq.com>`. No credential values are stored in this repository.

The public website is `https://www.storecarehq.com`; authentication and the agency app use
`https://app.storecarehq.com`. Supabase Site URL is the app origin, with its exact
`/auth/callback` URL allowed alongside the existing apex, www, Vercel and localhost callbacks.
Login and email-link requests must start on the app host so PKCE and recovery-intent cookies
remain on the callback host. Existing website sessions require one sign-in on the app domain.
The earlier delivered reset test used the temporary sending domain; end-to-end inbox delivery
from the new sending domain has not yet been tested.

For a fresh project, configure SMTP under Authentication → Emails → SMTP Settings.
Then set the subject and paste the corresponding HTML into each template's Source editor,
save, and reopen it to verify persistence. Alternatively PATCH only the fields from
`auth-email-config.json` with a separately authorized Supabase Management API credential.
Do not commit that credential or SMTP passwords to this repository.

The sender name/address and provider-added footer are delivery settings, not HTML-template
settings. Custom SMTP is the path to sending from a verified StoreCare-branded address.

## Link handling and compatibility

- The action button and fallback link retain Supabase's `{{ .ConfirmationURL }}` unchanged.
  This preserves the current PKCE callback and password-reset flow.
- No hardcoded authentication URLs, expiry durations, tokens, user data, external images,
  scripts, web fonts, or tracking pixels.
- Table layout, inline styles, email-safe system fonts, mobile padding, and Outlook fallback
  markup. Browser previews are not a claim of testing every email client.
- Supabase handles single-use links and expiry. The copy asks users to open the link in the
  requesting browser because the app uses PKCE.

Checked all three rendered previews and verified their placeholder links programmatically.
The reset test was sent only after explicit user approval. The user must open their own reset
link in the requesting browser to verify the final inbox/password flow; no password was changed.

Reference: https://supabase.com/docs/guides/auth/auth-email-templates
