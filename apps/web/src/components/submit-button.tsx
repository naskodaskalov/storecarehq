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
}: {
  children: ReactNode;
  pendingText: string;
  secondary?: boolean;
  style?: CSSProperties;
  /** For forms driven by useActionState, pass its pending flag. */
  pending?: boolean;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;
  return (
    <button
      type="submit"
      className={`btn${secondary ? ' secondary' : ''}`}
      disabled={pending}
      aria-busy={pending}
      style={style}
    >
      {pending && <span className="spinner" aria-hidden="true" />}
      {pending ? pendingText : children}
    </button>
  );
}
