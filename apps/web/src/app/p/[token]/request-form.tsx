'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/submit-button';
import { sendRequest, type RequestState } from './actions';

export function RequestForm({ token, agencyName }: { token: string; agencyName: string }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(sendRequest.bind(null, token), { ok: false, message: null });
  const v = state.values ?? {};
  // React resets the form after each send; inputs fall back to these defaults (everything after an error,
  // only name and email after a successful send).
  return (
    <form action={action} className="portal-form" noValidate>
      <div className="portal-field">
        <label htmlFor="pr-subject">What do you need?</label>
        <input id="pr-subject" name="subject" type="text" maxLength={200} required placeholder="e.g. Add the winter bundle to the menu" defaultValue={v.subject} />
      </div>
      <div className="portal-field">
        <label htmlFor="pr-body">Details <span>(optional)</span></label>
        <textarea id="pr-body" name="body" rows={4} maxLength={5000} placeholder="Links, deadlines, anything that helps." defaultValue={v.body} />
      </div>
      <div className="portal-row">
        <div className="portal-field">
          <label htmlFor="pr-name">Your name</label>
          <input id="pr-name" name="name" type="text" maxLength={120} autoComplete="name" defaultValue={v.name} />
        </div>
        <div className="portal-field">
          <label htmlFor="pr-email">Your email</label>
          <input id="pr-email" name="email" type="email" maxLength={320} required autoComplete="email" defaultValue={v.email} />
        </div>
      </div>
      <fieldset className="portal-urgency">
        <legend>How urgent is it?</legend>
        <label><input type="radio" name="urgency" value="normal" defaultChecked={v.urgency !== 'urgent'} /> Normal</label>
        <label><input type="radio" name="urgency" value="urgent" defaultChecked={v.urgency === 'urgent'} /> Urgent: it is costing sales now</label>
      </fieldset>
      <div aria-hidden="true" className="portal-hp">
        <label htmlFor="pr-website">Website</label>
        <input id="pr-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="portal-submit">
        <SubmitButton pendingText="Sending…" pending={pending}>Send to {agencyName}</SubmitButton>
        {state.message && (
          <p role={state.ok ? 'status' : 'alert'} className={state.ok ? 'portal-ok' : 'portal-error'}>{state.message}</p>
        )}
      </div>
    </form>
  );
}
