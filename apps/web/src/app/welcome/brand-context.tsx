'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import type { ScanSummary } from '@/lib/scan';
import type { StoreChange, StoreMemory } from '@/lib/store-memory';

/** A store the visitor just checked in the hero, with what their browser remembers about it.
 *  `saved` is false when the browser won't let the page keep anything (private mode, blocked storage). */
export type CheckedStore = { scan: ScanSummary; memory: StoreMemory; found: StoreChange[]; seenBefore: string | null; saved: boolean };

type Hero = {
  name: string;
  color: string;
  setName: (v: string) => void;
  setColor: (v: string) => void;
  checked: CheckedStore | null;
  /** Show a checked store's report preview (switches the hero report to it). */
  setChecked: (c: CheckedStore) => void;
  view: 'sample' | 'store';
  setView: (v: 'sample' | 'store') => void;
};

const HeroContext = createContext<Hero | null>(null);

/** The hero's shared state: the visitor's agency name and colour, and the store they checked, used by the
 *  sample report, its preview of the checked store and the note to the store owner. */
export function BrandProvider({ initialColor, children }: { initialColor: string; children: ReactNode }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(initialColor);
  const [checked, setCheckedState] = useState<CheckedStore | null>(null);
  const [view, setView] = useState<'sample' | 'store'>('sample');
  const setChecked = useCallback((c: CheckedStore) => {
    setCheckedState(c);
    setView('store');
  }, []);
  return <HeroContext.Provider value={{ name, color, setName, setColor, checked, setChecked, view, setView }}>{children}</HeroContext.Provider>;
}

export function useBrand(): Hero {
  const b = useContext(HeroContext);
  if (!b) throw new Error('useBrand outside BrandProvider');
  return b;
}
