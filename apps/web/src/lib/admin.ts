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

/** The time zone admin pages count "today" in and show times in: STORECARE_ADMIN_TIMEZONE (an IANA name such as
 *  Europe/London), Europe/Sofia when unset, UTC when the name is not a real time zone. */
export function adminTimezone(raw = process.env.STORECARE_ADMIN_TIMEZONE): string {
  const tz = raw?.trim() || 'Europe/Sofia';
  // Names only: Postgres reads a bare offset like "+02:00" with POSIX's inverted sign.
  if (!/^[A-Za-z][\w+-]*(\/[\w+-]+)*$/.test(tz)) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/** True when this signed-in email is a configured admin. Only trust emails from the auth session, never from a form. */
export function isAdminEmail(email: string | null | undefined, raw = process.env.STORECARE_ADMIN_EMAILS): boolean {
  if (!email) return false;
  return adminEmails(raw).has(email.trim().toLowerCase());
}
