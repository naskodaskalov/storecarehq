'use client';

import { useState } from 'react';

export function PasswordField({ name = 'password', label = 'Password', autoComplete = 'current-password', minLength }: {
  name?: string; label?: string; autoComplete?: 'current-password' | 'new-password'; minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return <div className="field">
    <label htmlFor={name}>{label}</label>
    <div className="password-input">
      <input id={name} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        required minLength={minLength} maxLength={autoComplete === 'new-password' ? 128 : 1024} spellCheck={false} />
      <button type="button" aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={visible}
        onClick={() => setVisible(!visible)}>{visible ? 'Hide' : 'Show'}</button>
    </div>
  </div>;
}
