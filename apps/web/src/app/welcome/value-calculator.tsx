'use client';

import { useState } from 'react';

const PLANS = [
  { name: 'Solo', price: 29, stores: 5 },
  { name: 'Agency', price: 79, stores: 20 },
  { name: 'Pro', price: 149, stores: 50 },
];
// Stated on the page so the maths is checkable: writing one report by hand vs approving a draft.
const MANUAL_REPORT_MIN = 60;
const DRAFT_REVIEW_MIN = 10;

const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

export function ValueCalculator({ signup }: { signup: string }) {
  const [clients, setClients] = useState(8);
  const [fee, setFee] = useState(400);
  const plan = PLANS.find((p) => clients <= p.stores) ?? PLANS[PLANS.length - 1];
  const yearly = clients * fee * 12;
  const oneClientYear = fee * 12;
  const planYear = plan.price * 12;
  const monthsCovered = oneClientYear / plan.price;
  const hoursSaved = Math.round((clients * (MANUAL_REPORT_MIN - DRAFT_REVIEW_MIN)) / 60 * 10) / 10;
  const share = (plan.price / (clients * fee)) * 100;

  return (
    <div className="lp-calc">
      <div className="lp-calc-inputs">
        <label className="lp-range">
          <span>Care-plan clients <output>{clients}</output></span>
          <input type="range" min={1} max={50} value={clients} onChange={(e) => setClients(Number(e.target.value))} />
        </label>
        <label className="lp-range">
          <span>Average care-plan fee <output>{usd(fee)}<small>/month</small></output></span>
          <input type="range" min={100} max={2000} step={50} value={fee} onChange={(e) => setFee(Number(e.target.value))} />
        </label>
        <p className="lp-calc-assume">Report time assumes about {MANUAL_REPORT_MIN} minutes to write one by hand and {DRAFT_REVIEW_MIN} to check a draft.</p>
      </div>
      <div className="lp-calc-out" aria-live="polite">
        <div className="lp-calc-big">
          <span>Care revenue you’re protecting</span>
          <strong>{usd(yearly)}<small>/year</small></strong>
        </div>
        <ul>
          <li><strong>{usd(oneClientYear)}</strong> a year walks out with one client who stops seeing what they pay for.</li>
          <li>Keeping that one client pays for StoreCare {plan.name} for <strong>{monthsCovered >= 24 ? `${Math.floor(monthsCovered / 12)} years` : `${Math.floor(monthsCovered)} months`}</strong>.</li>
          <li><strong>{hoursSaved} hours</strong> back every month on reports alone.</li>
        </ul>
        <div className="lp-calc-plan">
          <span>{plan.name} plan · {usd(plan.price)}/month ({usd(planYear)}/year), {share < 1 ? 'under 1%' : `${share.toFixed(share < 10 ? 1 : 0)}%`} of your care revenue</span>
          <a href={signup} className="btn">Start free trial</a>
        </div>
      </div>
    </div>
  );
}
