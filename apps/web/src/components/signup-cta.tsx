// "Check all your client stores" on a hosted outreach link: a slim bar above the report and a panel under it. Both go
// to /outreach/r/<token>/start, which prefills the client store and, until Black Friday, carries the offer (a trial
// until 2 December). Hidden when the report is printed.

import { PLANS, TRIAL_DAYS } from '@/lib/billing';
import { currentOffer, offerDay, offerKey, offerTrialEnd } from '@/lib/signup-offer';

function terms() {
  // The start route only sets the offer when it can sign it, so only then is it promised here. Close to Black
  // Friday the usual 7 days run longer than the offer, and those are what the visitor gets.
  const offer = offerKey() ? currentOffer() : null;
  const end = offerTrialEnd(offer);
  return { offer, free: end ? `Free until ${offerDay(end)}` : `${TRIAL_DAYS} days free` };
}

export function SignupCtaBar({ token }: { token: string }) {
  const { offer, free } = terms();
  return (
    <div className="signup-cta-bar no-print">
      <p>{offer ? 'Run this check on every client store, in your branding.' : 'Monitor every client store, in your branding.'} <span>{free}.</span></p>
      <a className="btn" href={`/outreach/r/${token}/start`}>{offer ? 'Check all your client stores' : 'Start your free trial'}</a>
    </div>
  );
}

export function SignupCta({ token, host, kind }: { token: string; host?: string; kind: 'health' | 'sample' }) {
  const { offer, free } = terms();
  const title = kind === 'sample' ? 'Send reports like this under your name' : offer ? 'Run this check on all your client stores' : 'Watch all your client stores';
  const body = kind === 'sample'
    ? 'Each client gets a monthly report in your branding, built from daily monitoring and your work log.'
    : offer
      ? 'One page per store in your agency’s branding, ready to send to each client before the sale. After the sale, daily monitoring and a monthly report under your name.'
      : 'Daily uptime, test checkouts, speed and theme or app changes, with a monthly report under your agency’s name.';
  return (
    <aside className="signup-cta no-print" aria-labelledby="signup-cta-title">
      <div>
        <h2 id="signup-cta-title">{title}</h2>
        <p>{body}{host ? <> We’ll fill in <strong>{host}</strong> for you.</> : null}</p>
        <p className="signup-cta-terms">{free}, then from ${PLANS.solo.usd} a month. Card required; cancel any time before then and you pay nothing.</p>
      </div>
      <a className="btn" href={`/outreach/r/${token}/start`}>{offer ? 'Check all your client stores' : 'Start your free trial'} →</a>
    </aside>
  );
}
