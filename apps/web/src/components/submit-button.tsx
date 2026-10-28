'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useFormStatus } from 'react-dom';

/** A form's submit button that shows a spinner and a "working" label while the server action runs,
 *  and blocks double submits. Must be rendered inside the <form>. */
export function SubmitButton({
  children,
  pendingText,
  secondary,
  style,
  pending: pendingOverride,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingText: string;
  secondary?: boolean;
  style?: CSSProperties;
  /** For forms driven by useActionState, pass its pending flag. */
  pending?: boolean;
  /** For forms with more than one submit button: sent with the form when this one is clicked. */
  name?: string;
  value?: string;
  /** Unavailable regardless of form state. */
  disabled?: boolean;
}) {
  const { pending: formPending, data } = useFormStatus();
  const pending = pendingOverride ?? formPending;
  // With two submit buttons in one form, only the one that was clicked shows the spinner.
  const mine = !name || !data || data.get(name) === value;
  const busy = pending && mine;
  return (
    <button
      type="submit"
      className={`btn${secondary ? ' secondary' : ''}`}
      disabled={pending || disabled}
      aria-busy={busy}
      style={style}
      name={name}
      value={value}
    >
      {busy && <span className="spinner" aria-hidden="true" />}
      {busy ? pendingText : children}
    </button>
  );
}
