# Outreach email preview, approval and sending

Status: proposed extension to the approved outreach-preparation workflow. No outgoing messages or production changes made.

## Approved testing phase (latest user instruction)

Implement Resend testing now; switching transport and real agency sending remain later work.
Test recipient is always the verified signed-in admin email, resolved on the server, never the prospect email.
Demo mode previews only. Sender defaults to StoreCare HQ <support@storecarehq.com> with OUTREACH_FROM
override for a verified sending identity; reply-to is the receiving admin address. The server signs
an approval of the exact rendered payload for 15 minutes. Editing subject, text or report invalidates
approval. Resend idempotency uses the payload digest for retry deduplication within its 24-hour window.
This phase intentionally has no durable campaign ledger, public report links or database changes.
Both report snapshots are attached as escaped standalone HTML documents and previewable before approval.
The email CTA opens the real StoreCare HQ website; no fabricated report links are emitted.

Testing-phase files: [NEW] apps/web/src/lib/outreach-email.ts, outreach-email.test.ts,
outreach-delivery.ts, outreach-delivery.test.ts; [NEW] apps/web/src/app/admin/outreach/actions.ts
and email-composer.tsx; [MODIFY] outreach-form.tsx, page.tsx, outreach.css in that directory;
[MODIFY] apps/web/.env.example, task.md and system_architecture.md. The earlier database/public-link
file list below describes the later rollout, not a prerequisite for testing. No actual send occurs
during implementation; tests mock the transport and the user sends approved test content via the UI.

## Result

Admin edits recipient, subject and introduction; previews a branded HTML email matching the supplied report email; approves that exact version; then uses Send approved email. The email links to a current health check and an illustrative monthly report. It is signed by StoreCare HQ, not the prospect agency. Prospect branding remains inside the illustrative report with its sample notice.

## Sending dependency

The existing report-email transport uses Resend. Its current acceptable-use policy explicitly prohibits cold outreach and directory/scraped recipients: https://resend.com/legal/acceptable-use. Do not send prospect introductions through that account. The user has been asked for the sending mailbox/service and reply address. Resolve its supported authorization method and sending terms before selecting the implementation of the delivery adapter. Do not request passwords in chat.

## Email design and content

- Use the supplied email's 560px card, pale background, dark header, blue accent, inline styling, mobile rules, Outlook table fallback and plain-text alternative.
- Header: StoreCare HQ. Kicker: Prepared for [agency]. Heading: Make your Shopify care work visible.
- Editable personal introduction references only verified portfolio details and current measurements. Do not insert invented prior-month results or claim work was performed.
- Primary CTA: View sample monthly report. Secondary CTA: View current health check. Include usable text fallback links.
- Explain that the monthly report has fictional monitoring data/tasks/hours and illustrates the client-report format; the health check is a dated current snapshot.
- Footer: real sender/company details, monitored reply address and an opt-out link. Public contact information alone is not recorded as consent.

## Workflow

1. Prepare a prospect as before and edit the intended recipient, subject and body.
2. Create a saved outreach bundle with immutable dated scan and sample-report snapshots. Show actual link destinations in the preview. Links expire after 30 days and can be revoked; public views expose report content only, never the recipient address or email draft.
3. Render the preview with the same escaped HTML template used for delivery, inside a sandboxed iframe. No arbitrary HTML editor. Add a plain-text preview.
4. Approve the exact recipient, subject, body, sender, reply address and bundle version on the server. Any edit creates a new version and invalidates approval. Refreshing a scan also invalidates the relevant version.
5. Send only that approved immutable version using an admin-checked server action. UI disables repeat clicks; an atomic durable claim prevents concurrent sends across tabs and reloads. Keep a server-side provider id and accepted timestamp. Label success as accepted/sent, not delivered.
6. Timeouts with uncertain provider acceptance stay in an explicit unknown state; do not silently retry and risk duplicate delivery. Reconcile with provider status where supported. Failures retain the approved draft and show a useful error.
7. Save recipient opt-outs durably and check suppression immediately before sending, including when importing an older backup or creating a new campaign. Opt-out GET displays a confirmation page; POST changes state so link scanners cannot unsubscribe accidentally. No automated follow-ups in this phase.
8. Keep CSV/JSON exports compatible with the existing packs. Persist approval/send truth server-side; imported statuses or approval fields cannot authorize sending.

## Files

- [NEW] apps/web/src/lib/outreach-email.ts — typed content validation; subject, escaped HTML and plain-text templates.
- [NEW] apps/web/src/lib/outreach-email.test.ts — escaping, responsive template, fictional-data notice, valid link handling and header-input validation.
- [NEW] apps/web/src/lib/outreach-delivery.ts — server-side adapter for the confirmed sending mailbox/service; credential/configuration handling and accepted/failed/unknown result mapping.
- [NEW] apps/web/src/lib/outreach-delivery.test.ts — mocked provider calls, no sends on invalid/unapproved/suppressed inputs, uncertain result handling.
- [NEW] apps/web/src/lib/outreach-mail-workflow.ts — immutable bundle/version persistence, approvals, atomic send claims, suppression and expiry/revocation.
- [NEW] apps/web/src/lib/outreach-mail-workflow.test.ts — stale approvals, concurrent sends, imported backup abuse, suppression and expired/revoked links.
- [NEW] apps/web/src/app/admin/outreach/actions.ts — requireAdmin on save/approve/send/revoke; no client-provided sender or approval trusted.
- [MODIFY] apps/web/src/app/admin/outreach/page.tsx — expose safe sender configuration/readiness, no secrets.
- [MODIFY] apps/web/src/app/admin/outreach/outreach-form.tsx — recipient/subject/body fields, HTML/text previews, approval and send controls/status.
- [MODIFY] apps/web/src/app/admin/outreach/outreach.css — preview and approval controls, responsive layout.
- [MODIFY] apps/web/src/lib/outreach.ts and outreach.test.ts — backward-compatible optional bundle reference and email subject fields; never trust imported send authority.
- [NEW] apps/web/src/app/outreach/r/[token]/page.tsx — minimal saved report bundle view with noindex/no-store, expiry and sample labels; expose no contact details.
- [NEW] apps/web/src/app/outreach/opt-out/[token]/page.tsx and actions.ts — confirmation and POST opt-out.
- [MODIFY] apps/web/src/lib/domains.ts, domains.test.ts and apps/web/src/middleware.ts — explicitly allow only the report and opt-out public routes without requiring an account; retain private admin routes.
- [NEW] supabase/migrations/<CLI-generated timestamp>_outreach_email.sql — CLI-generated migration for bundles, approved immutable messages/send ledger and recipient suppression, with deny-by-default RLS for browser roles and server-only access. No changes to operational stores/work/reports. Exact filename is generated by `supabase migration new outreach_email` during implementation.
- [MODIFY] apps/web/.env.example — confirmed transport's server-only settings, sender/reply address and company identification.
- [MODIFY if needed] apps/web/package.json and package-lock.json — pinned transport dependency only if the confirmed sending integration requires it.
- [MODIFY] system_architecture.md and task.md — workflow, configuration, migration, verification and rollout notes.

## Verification and rollout

- Use provider mocks and a local mail capture for sending tests; no prospect gets an implementation/test email.
- Test migration constraints and role isolation against a local/test database; verify two simultaneous send requests result in at most one outbound call.
- Run web unit tests, all workspace type checks and production build.
- Browser review: edit/preview/approve/send states, approval invalidation, actual link routing, mobile layout, opt-out, expired links and duplicate-click handling.
- Deployment and applying the reviewed migration are separate rollout actions. Do not send a real message until the admin explicitly approves its final recipient/content and presses Send.
