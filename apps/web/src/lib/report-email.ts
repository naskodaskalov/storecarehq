// One report version to one address is one email. Used as Resend's Idempotency-Key (1–256 characters, kept 24h).

export function reportEmailKey(reportId: string, version: string, to: string): string {
  return `report/${reportId}/${version}/${to.trim().toLowerCase()}`.slice(0, 256);
}
