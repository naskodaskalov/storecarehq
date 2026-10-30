import type { CSSProperties } from 'react';

const paths = {
  logout: 'M9 3H3v18h6M9 12h12m-5-5 5 5-5 5',
  home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1Z',
  store: 'M3 10v11h18V10M2 10l2-7h16l2 7M2 10c0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0 0 4 5 4 5 0M9 21v-7h6v7',
  work: 'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',
  report: 'M14 2H5v20h14V7ZM14 2v6h5M8 12h8M8 16h6',
  billing: 'M3 5h18v14H3ZM3 10h18M7 15h3',
  mail: 'M3 5h18v14H3ZM3 5l9 7 9-7',
  clock: 'M12 8v5l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  alert: 'M12 8v5M12 17h.01M12 2 1 21h22Z',
  check: 'm5 12 4 4L19 6',
  close: 'm6 6 12 12M6 18 18 6',
  minus: 'M5 12h14',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  plus: 'M12 5v14M5 12h14',
  chevron: 'm9 5 7 7-7 7',
  calendar: 'M4 5h16v16H4ZM8 2v6M16 2v6M4 11h16',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
} as const;

export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, style }: { name: IconName; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
