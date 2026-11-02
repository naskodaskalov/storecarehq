// Who may use the admin tools (the quick report). Admins are named by email in STORECARE_ADMIN_EMAILS,
// a comma-separated list, so no database change is needed and nobody can grant themselves the role.

/** The admin emails configured for this deployment, lower-cased. */
export function adminEmails(raw = process.env.STORECARE_ADMIN_EMAILS): Set<string> {
  return new Set(
    (raw ?? '')
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes('@')),
  );
}

/** True when this signed-in email is a configured admin. Only trust emails from the auth session, never from a form. */
export function isAdminEmail(email: string | null | undefined, raw = process.env.STORECARE_ADMIN_EMAILS): boolean {
  if (!email) return false;
  return adminEmails(raw).has(email.trim().toLowerCase());
}
