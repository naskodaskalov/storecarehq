'use client';

import type { Facts, Sections } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { useBrand } from './brand-context';

const SWATCHES = ['#2747A8', '#0F766E', '#C2410C', '#7C3AED', '#BE123C', '#16181D'];
const HEX = /^#[0-9a-f]{6}$/i;

/** The hero's sample report, re-branded live with the visitor's agency name and colour. */
export function BrandReport({ facts, summary, sections }: { facts: Facts; summary: string; sections: Sections }) {
  const { name, setName, color, setColor } = useBrand();
  const agency = name.trim() || facts.agencyName;
  const brand = HEX.test(color) ? color : facts.brandColor;
  // The drafted summary is written in the agency's voice ("we"), so only the header and accents change.
  const branded: Facts = { ...facts, agencyName: agency, brandColor: brand };

  return (
    <figure className="lp-hero-report">
      <div className="lp-brand-bar" role="group" aria-label="Brand this sample report">
        <span className="lp-brand-bar-title">Make it yours</span>
        <input aria-label="Your agency name" placeholder="Your agency name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <div className="lp-swatches">
          {SWATCHES.map((s) => (
            <button key={s} type="button" aria-label={`Brand colour ${s}`} aria-pressed={brand.toUpperCase() === s} style={{ background: s }} onClick={() => setColor(s)} />
          ))}
          <label className="lp-swatch-custom" title="Pick any colour">
            <input type="color" aria-label="Pick any brand colour" value={brand} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>
      </div>
      <div className="lp-report-frame" aria-label="Example client report">
        <ReportView facts={branded} summary={summary} sections={sections} />
      </div>
      <figcaption>
        {name.trim()
          ? <>This is what {agency}’s clients would get on the 1st. Drafted for you; nothing is sent until you approve it.</>
          : <>A sample report drafted on 1 November for a fictional store. Type your agency name to see it as your clients would.</>}
      </figcaption>
    </figure>
  );
}
