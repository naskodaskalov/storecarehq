# Outreach report links

Status: approved and implemented locally. This replaces test-email attachments with hosted report views. Production migration/deployment remain rollout steps.

## User experience

- Email buttons: View store health check and View sample monthly report. Include both URLs in plain text and as fallback text in the HTML email. Remove attachments and attachment wording entirely.
- Each link opens a report on app.storecarehq.com without login. Reuse the report view and existing Print / Save as PDF interaction. Be explicit: saving a PDF uses the browser print dialog, not an automatic PDF download. Also provide Download HTML for a direct file download using the existing standalone report HTML.
- Health check remains a dated snapshot. The sample remains clearly labeled fictional on screen, in print and in the downloadable file.
- Links expire after 30 days and can be revoked by the admin. Anyone possessing a link can access its report until expiry or revocation. Exclude reports from indexing and caching; do not put recipient details or email drafts on public pages.
- Creating hosted report links is an explicit admin action before approving the email. Refreshing findings creates a new snapshot/version and clears approval. Sending remains test-only to the authenticated admin via Resend.

## Storage and access

The existing /r/<token> route shares approved operational client reports. Outreach reports are currently transient browser records and cannot be placed in that table without tying them to real stores. Add a separate outreach snapshot table; do not create fake stores/work or change operational reports.

Store immutable snapshot data, created-by admin identity, expiry and revocation. Generate two random report tokens server-side and persist their hashes, not the raw bearer tokens. Keep browser roles denied by default; server actions requireAdmin and use the existing server-only service client. Public routes resolve only a valid token hash and return only its report type/content. Validate snapshot shapes/sizes and escape all rendered text. Public file downloads use fixed safe filenames and response headers.

## Files

- [NEW] apps/web/src/lib/outreach-report-links.ts — validate/create/read/revoke immutable snapshots and link expiry; isolate persistence behind a testable adapter.
- [NEW] apps/web/src/lib/outreach-report-links.test.ts — token separation, missing/expired/revoked snapshots, public response privacy, auth boundaries and immutable content.
- [NEW] apps/web/src/app/outreach/r/[token]/page.tsx — render the correct report, sample notice, save-as-PDF control and download link; noindex/no-store metadata/headers.
- [NEW] apps/web/src/app/outreach/r/[token]/download/route.ts — resolve the same valid token and download escaped standalone HTML, with no-store and safe Content-Disposition headers.
- [MODIFY] apps/web/src/app/admin/outreach/actions.ts — admin-only publish/revoke actions; approval/send resolve the exact saved snapshot version.
- [MODIFY] apps/web/src/app/admin/outreach/email-composer.tsx — prepare links, preview destinations, expiry/revocation controls and updated approval state.
- [MODIFY] apps/web/src/app/admin/outreach/outreach-form.tsx, page.tsx, outreach.css — link status and persistence readiness; invalidate links when report data changes.
- [MODIFY] apps/web/src/lib/outreach-email.ts and outreach-email.test.ts — replace attachment sections with two working report CTAs and plain-text URLs; continue using current generated documents for direct HTML downloads.
- [MODIFY] apps/web/src/lib/outreach-delivery.ts and outreach-delivery.test.ts — remove provider attachments; bind approval to immutable report version/link destinations and reject expired/revoked links before delivery. Preserve test-only recipient enforcement and duplicate-prevention behavior.
- [MODIFY] apps/web/src/lib/outreach.ts and outreach.test.ts — backward-compatible saved bundle references in backups; imported references must be verified server-side before use.
- [MODIFY] apps/web/src/middleware.ts, apps/web/src/lib/domains.ts and domains.test.ts — explicitly permit public report and download paths, while retaining private admin routes.
- [NEW] supabase/migrations/<CLI-generated timestamp>_outreach_report_links.sql — generate filename with `supabase migration new outreach_report_links`; separate snapshot table with deny-by-default RLS and necessary server-only grants.
- [MODIFY] system_architecture.md, task.md and apps/web/.env.example — server-only storage requirements, migration, link lifecycle and verification notes.

## Verification and rollout

- Test the migration and role isolation on a local/test database before production rollout.
- Verify no recipient addresses/draft text appear on public pages or downloads, tokens are not interchangeable, and expired/revoked tokens fail consistently on view and download routes.
- Mock delivery and assert the Resend request has no attachments and both report URLs match the approved snapshot.
- Run web tests, workspace type checks and production build; browser-check report links, mobile views, print views and direct HTML downloads without login.
- Applying the reviewed production migration and deploying are distinct rollout steps. No email is sent as part of implementation/testing.
