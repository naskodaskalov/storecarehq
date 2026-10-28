// Shown instantly between onboarding steps.
export default function Loading() {
  return (
    <div className="onb" role="status" aria-label="Loading">
      <div className="page-progress" />
      <div className="onb-top" style={{ height: 30 }} />
      <div className="onb-card">
        <div className="skeleton" style={{ height: 36, width: '70%' }} />
        <div className="skeleton" style={{ height: 20, width: '90%' }} />
        <div className="skeleton" style={{ height: 180 }} />
      </div>
    </div>
  );
}
