/** Agency details a workspace member can edit on /settings. Mirrors the columns granted for update in
 *  supabase/migrations/20261029000002_billing.sql (plan, trial and billing fields are never editable here). */

export const BANDS = ['1–5', '6–15', '16–40', '40+'] as const;
export const DEFAULT_BRAND_COLOR = '#2747A8';

export type AgencyProfile = {
  name: string;
  brandColor: string;
  logoUrl: string | null;
  senderEmail: string | null;
  band: string | null;
};

type Input = { name: string; brandColor: string; logoUrl: string; senderEmail: string; band: string };

export function validateAgencyProfile(input: Input): { ok: true; profile: AgencyProfile } | { ok: false; error: string } {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Enter your agency name.' };
  if (name.length > 80) return { ok: false, error: 'Keep the agency name under 80 characters.' };

  let brandColor = input.brandColor.trim() || DEFAULT_BRAND_COLOR;
  if (/^#?[0-9a-f]{3}$/i.test(brandColor)) brandColor = '#' + brandColor.replace('#', '').split('').map((c) => c + c).join('');
  if (/^[0-9a-f]{6}$/i.test(brandColor)) brandColor = '#' + brandColor;
  if (!/^#[0-9a-f]{6}$/i.test(brandColor)) return { ok: false, error: 'Brand colour must be a hex value like #2747A8.' };

  const logo = input.logoUrl.trim();
  let logoUrl: string | null = null;
  if (logo) {
    let u: URL;
    try {
      u = new URL(logo);
    } catch {
      return { ok: false, error: 'Logo address must be a full https:// link to an image.' };
    }
    if (u.protocol !== 'https:') return { ok: false, error: 'Logo address must start with https://.' };
    if (logo.length > 500) return { ok: false, error: 'Logo address is too long.' };
    logoUrl = u.toString();
  }

  const email = input.senderEmail.trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'That reply-to email does not look right.' };

  const band = input.band.trim();
  if (band && !(BANDS as readonly string[]).includes(band)) return { ok: false, error: 'Pick how many client stores you look after.' };

  return { ok: true, profile: { name, brandColor: brandColor.toUpperCase(), logoUrl, senderEmail: email || null, band: band || null } };
}
