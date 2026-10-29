import { SubmitButton } from '@/components/submit-button';
import { createWorkspace } from './actions';
import { OnboardingFrame } from './steps';

const BANDS = ['1–5', '6–15', '16–40', '40+'];

export default async function Step1({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <OnboardingFrame step={1}>
      <section className="onb-card">
        <div>
          <h1>Let’s make this your workspace.</h1>
          <p className="setup-description">
            Start with your agency name. We’ll help you connect your first client store next.
          </p>
        </div>
        <form action={createWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label htmlFor="agency">Agency or business name</label>
            <input id="agency" name="agency" type="text" placeholder="e.g. Northline Studio" required autoComplete="organization" />
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>How many client stores do you look after?</legend>
            <div className="setup-store-bands">
              {BANDS.map((b) => (
                <label key={b} className="setup-band">
                  <input type="radio" name="band" value={b} /><strong>{b}</strong><span>stores</span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <div className="error" role="alert">{error === 'name' ? 'Enter your agency name.' : error}</div>}
          <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
            <span className="small muted">Next: pick a plan. The first 7 days are free.</span>
            <SubmitButton pendingText="Creating workspace…">Create workspace →</SubmitButton>
          </div>
        </form>
      </section>
    </OnboardingFrame>
  );
}
