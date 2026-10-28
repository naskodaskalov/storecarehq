'use client';

import { useState } from 'react';

export function CopyButton({ text, label = 'Copy link' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* clipboard blocked: the link is visible to copy by hand */
        }
      }}
    >
      {copied ? 'Copied' : label}
    </button>
  );
}

export function PrintButton() {
  return (
    <button type="button" className="btn" onClick={() => window.print()}>
      Save as PDF
    </button>
  );
}
