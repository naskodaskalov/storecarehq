// Shown instantly between onboarding steps.
export default function Loading() {
  return (
    <div className="setup-shell" role="status" aria-label="Loading setup">
      <div className="page-progress" />
      <div className="setup-header"><div className="brand"><span className="mark">SC</span>StoreCare HQ</div></div>
      <div className="setup-layout">
      <aside className="setup-rail" aria-hidden="true"><span className="setup-kicker">YOUR WORKSPACE IS TAKING SHAPE</span></aside>
      <div className="setup-content"><div className="onb-card" aria-hidden="true">
        <div className="skeleton" style={{ height: 36, width: '70%' }} />
        <div className="skeleton" style={{ height: 20, width: '90%' }} />
        <div className="skeleton" style={{ height: 180 }} />
      </div>
      </div></div>
    </div>
  );
}
