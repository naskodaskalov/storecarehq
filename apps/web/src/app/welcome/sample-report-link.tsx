'use client';

import { useBrand } from './brand-context';

/** Back to the hero's finished sample report, even when it is showing a checked store's preview. */
export function SampleReportLink() {
  const { setView } = useBrand();
  return (
    <a
      href="#top"
      className="lp-replay-link"
      onClick={() => {
        setView('sample');
      }}
    >
      See the finished report ↑
    </a>
  );
}
