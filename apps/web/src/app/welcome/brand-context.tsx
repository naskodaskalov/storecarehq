'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type Brand = { name: string; color: string; setName: (v: string) => void; setColor: (v: string) => void };

const BrandContext = createContext<Brand | null>(null);

/** The visitor's agency name and colour, shared by the hero's sample report and the store check-up. */
export function BrandProvider({ initialColor, children }: { initialColor: string; children: ReactNode }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(initialColor);
  return <BrandContext.Provider value={{ name, color, setName, setColor }}>{children}</BrandContext.Provider>;
}

export function useBrand(): Brand {
  const b = useContext(BrandContext);
  if (!b) throw new Error('useBrand outside BrandProvider');
  return b;
}
