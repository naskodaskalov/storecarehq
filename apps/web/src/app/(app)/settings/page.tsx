import { requireAgency } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { DEFAULT_BRAND_COLOR } from '@/lib/agency-profile';
import { SubmitButton } from '@/components/submit-button';
import { BrandFields } from './brand-fields';
import { saveAgency } from './actions';

export default async function AgencySettings({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { saved, error } = await searchParams;
  const { agency, userId } = await requireAgency();
  const supabase = await supabaseServer();
  const [{ data: details }, { data: membership }] = await Promise.all([
    supabase.from('agencies').select('name, brand_color, logo_url, sender_email').eq('id', agency.id).single(),
    supabase.from('memberships').select('role').eq('agency_id', agency.id).eq('user_id', userId).single(),
  ]);
  const a = details ?? { name: agency.name, brand_color: agency.brand_color, logo_url: null, sender_email: null };
  const isOwner = membership?.role === 'owner';

  return (
    <div className="workspace-page settings-page">
      <header className="page-heading"><div>
        <h1>Agency settings</h1>
        <p>Your agency&apos;s name and branding, as clients see them on reports.</p>
      </div></header>

      {saved && <div className="notice" style={{ background: 'var(--accent-soft)', borderColor: 'transparent' }} role="status">Agency details saved.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      {!isOwner && <div className="notice" role="status">Only the workspace owner can change these details.</div>}

      <form action={saveAgency} className="workspace-settings-form">
        <fieldset disabled={!isOwner} style={{ border: 0, margin: 0, padding: 0, minWidth: 0, display: 'contents' }}>
          <section className="workspace-section" id="agency-profile">
            <h2>Agency</h2>
            <div className="workspace-form-grid">
              <div className="field">
                <label htmlFor="name">Agency name</label>
                <input id="name" name="name" type="text" defaultValue={a.name} required maxLength={80} autoComplete="organization" />
                <span className="small muted">Shown in the app and on every client report.</span>
              </div>
            </div>
          </section>

          <section className="workspace-section" id="agency-branding">
            <h2>Report branding</h2>
            <BrandFields agencyName={a.name} brandColor={a.brand_color || DEFAULT_BRAND_COLOR} logoUrl={a.logo_url} />
          </section>

          <section className="workspace-section" id="agency-email">
            <h2>Client emails</h2>
            <div className="workspace-form-grid">
              <div className="field">
                <label htmlFor="sender_email">Reply-to email <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
                <input id="sender_email" name="sender_email" type="email" defaultValue={a.sender_email ?? ''} placeholder="hello@youragency.com" autoComplete="email" />
                <span className="small muted">Where client replies to report emails should go.</span>
              </div>
            </div>
          </section>

          <div className="row workspace-form-actions">
            <span className="small muted">Plan and payment details are on the Billing page.</span>
            <SubmitButton pendingText="Saving…" disabled={!isOwner}>Save changes</SubmitButton>
          </div>
        </fieldset>
      </form>
    </div>
  );
}
