'use client';

// Pricing and "what a care client is worth" in one place: two sliders pick the plan, show what it costs against the
// agency's own care revenue, and carry the choice into sign-up (the trial page suggests it).

import { useEffect, useState } from 'react';

export type FinderPlan = { key: 'solo' | 'agency' | 'pro'; name: string; price: number; stores: number; note: string };

// Stated on the page so the maths is checkable: writing one report by hand vs approving a draft.
const MANUAL_REPORT_MIN = 60;
const DRAFT_REVIEW_MIN = 10;

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function planFor(plans: FinderPlan[], stores: number) {
  return plans.find((p) => stores <= p.stores) ?? plans[plans.length - 1];
}

/** Remembered across www and app subdomains so the trial page can suggest the same plan. */
function rememberPlan(key: string) {
  try {
    const host = window.location.hostname;
    const domain = host.endsWith('storecarehq.com') ? '; domain=.storecarehq.com' : '';
    document.cookie = `sc_plan=${key}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${domain}${location.protocol === 'https:' ? '; secure' : ''}`;
  } catch { /* cookies blocked: the trial page falls back to its own suggestion */ }
}

export function PlanFinder({ plans, signup }: { plans: FinderPlan[]; signup: string }) {
  const [stores, setStores] = useState(8);
  const [fee, setFee] = useState(400);
  const fit = planFor(plans, stores);
  const over = stores > plans[plans.length - 1].stores;
  const revenue = stores * fee;
  const share = (fit.price / revenue) * 100;
  const months = (fee * 12) / fit.price;
  const hours = Math.round((stores * (MANUAL_REPORT_MIN - DRAFT_REVIEW_MIN)) / 6) / 10;

  useEffect(() => { rememberPlan(fit.key); }, [fit.key]);

  return (
    <div className="lp-finder">
      <div className="lp-finder-controls">
        <label className="lp-range">
          <span>Client stores you look after <output>{over ? '50+' : stores}</output></span>
          <input type="range" min={1} max={60} value={stores} onChange={(e) => setStores(Number(e.target.value))} aria-describedby="finder-fit" />
        </label>
        <label className="lp-range">
          <span>Average care-plan fee <output>{usd(fee)}<small>/month</small></output></span>
          <input type="range" min={100} max={2000} step={50} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
      </div>

      <div className="lp-plans lp-plans-live">
        {plans.map((p) => {
          const isFit = p.key === fit.key;
          const tooSmall = stores > p.stores;
          return (
            <div key={p.key} className={`lp-plan${isFit ? ' lp-plan-fit' : ''}${tooSmall ? ' lp-plan-small' : ''}`} aria-current={isFit ? 'true' : undefined}>
              <div className="lp-plan-top">
                <h3>{p.name}</h3>
                {isFit && <span className="lp-fit-badge" id="finder-fit">{over ? 'Closest fit' : `Fits your ${stores} store${stores === 1 ? '' : 's'}`}</span>}
                {tooSmall && <span className="lp-small-note">Up to {p.stores}</span>}
              </div>
              <div className="lp-price"><span className="lp-amount">${p.price}</span> a month</div>
              <div className="lp-stores">Up to {p.stores} stores · ${(p.price / p.stores).toFixed(2)} per store</div>
              <p>{p.note}</p>
              <a href={signup} onClick={() => rememberPlan(p.key)} className={`btn${isFit ? '' : ' secondary'}`}>
                {isFit ? `Start free trial on ${p.name}` : 'Start free trial'}
              </a>
            </div>
          );
        })}
      </div>

      <div className="lp-finder-out" aria-live="polite">
        <div className="lp-finder-big">
          <span>Care revenue you’re protecting</span>
          <strong>{usd(revenue * 12)}<small>/year</small></strong>
        </div>
        <ul>
          <li><strong>{share < 1 ? 'Under 1%' : `${share.toFixed(share < 10 ? 1 : 0)}%`}</strong> of your care revenue goes to StoreCare {fit.name}.</li>
          <li>Keeping one client who would have left pays for it for <strong>{months >= 24 ? `${Math.floor(months / 12)} years` : `${Math.floor(months)} months`}</strong>.</li>
          <li><strong>{hours} hours</strong> back every month on reports alone.</li>
        </ul>
        {over && <p className="lp-finder-over">Looking after more than 50 stores? <a href="#contact">Tell us</a> and we’ll set up a plan that fits.</p>}
      </div>
      <p className="lp-calc-assume">Report time assumes about {MANUAL_REPORT_MIN} minutes to write one by hand and {DRAFT_REVIEW_MIN} to check a draft.</p>
    </div>
  );
}
