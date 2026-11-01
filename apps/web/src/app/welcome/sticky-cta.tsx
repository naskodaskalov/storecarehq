'use client';

import { useEffect, useState } from 'react';

/** Phones only: once the hero's CTA scrolls away, keep one at thumb's reach, until the closing CTA takes over. */
export function StickyCta({ signup }: { signup: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const hero = document.getElementById('check');
    const end = document.getElementById('end');
    const contact = document.getElementById('contact');
    if (!hero || !('IntersectionObserver' in window)) return;
    const seen = new Map<Element, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target, e.isIntersecting || (e.target === hero && e.boundingClientRect.top > 0));
      setShow(!seen.get(hero) && !(end && seen.get(end)) && !(contact && seen.get(contact)));
    });
    [hero, end, contact].forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, []);
  return (
    <div className={`lp-sticky${show ? ' on' : ''}`} aria-hidden={!show}>
      <span>7 days free · from $29/mo</span>
      <a href={signup} className="btn" tabIndex={show ? 0 : -1}>Start free trial</a>
    </div>
  );
}
