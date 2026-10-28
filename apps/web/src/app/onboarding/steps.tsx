const STEPS = ['Workspace', 'Free trial', 'Store', 'Care plan'];

export function OnboardingTop({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <div className="onb-top row">
      <div className="brand"><div className="mark">SC</div>StoreCare HQ</div>
      <ol className="steps" aria-label="Setup steps">
        {STEPS.map((s, i) => {
          const n = i + 1;
          const cls = n < step ? 'done' : n === step ? 'now' : '';
          return (
            <li key={s} className={cls} aria-current={n === step ? 'step' : undefined}>
              {n < step ? '✓' : n} {s}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
