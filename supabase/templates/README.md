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
using Resend with sender `StoreCare HQ <storecare@naskodaskalov.dev>`, host `smtp.resend.com`,
port 465 and username `resend`. The dedicated `StoreCare HQ Auth` key has sending-only access
restricted to the verified `naskodaskalov.dev` domain. Its value is stored in Supabase's SMTP
password setting, not in repository files. Existing keys for other projects were preserved.

Confirmation, recovery and magic-link subjects/bodies were saved in Supabase, with the original
`{{ .ConfirmationURL }}` placeholders preserved. A single user-authorized password-reset test
was sent from the local app; Resend reported it Delivered. This confirms SMTP delivery, not
that the recipient opened the email or completed the password change.

`naskodaskalov.dev` is the temporary sending domain. When the StoreCare domain is ready,
verify it in Resend, create a correspondingly restricted sending key, and update the Supabase
sender and SMTP password. The templates themselves do not depend on the sending domain.

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
