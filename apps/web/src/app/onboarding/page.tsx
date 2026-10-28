import { SubmitButton } from '@/components/submit-button';
import { createWorkspace } from './actions';
import { OnboardingTop } from './steps';

const BANDS = ['1–5', '6–15', '16–40', '40+'];

export default async function Step1({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="onb">
      <OnboardingTop step={1} />
      <section className="onb-card">
        <div>
          <h1 style={{ fontSize: 30 }}>Set up your agency workspace</h1>
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 16 }}>
            Takes about 10 minutes. By the end your first store is monitored.
          </p>
        </div>
        <form action={createWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div className="field">
            <label htmlFor="agency">Agency or business name</label>
            <input id="agency" name="agency" type="text" required />
          </div>
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 14, fontWeight: 500, marginBottom: 10 }}>How many client stores do you look after?</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
              {BANDS.map((b) => (
                <label key={b} className="check" style={{ border: '1px solid var(--border-strong)', borderRadius: 8, padding: '0 14px', alignItems: 'center' }}>
                  <input type="radio" name="band" value={b} style={{ marginTop: 0 }} /> {b}
                </label>
              ))}
            </div>
          </fieldset>
          {error && <div className="error">{error === 'name' ? 'Enter your agency name.' : error}</div>}
          <div className="row" style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
            <span className="small muted">14-day free trial · no card needed</span>
            <SubmitButton pendingText="Creating workspace…">Continue</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
