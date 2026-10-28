// Shown instantly while an app page loads (navigation, or the redirect after a form).
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="page-progress" />
      <div className="skeleton" style={{ height: 40, width: 260 }} />
      <div className="kpis">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 112 }} />
        ))}
      </div>
      <div className="skeleton" style={{ height: 320 }} />
    </div>
  );
}
