'use client';

import type { Facts, Sections } from '@storecare/reports';
import { ReportView } from '@/components/report-view';
import { storeName } from '@/lib/store-preview';
import { useBrand } from './brand-context';
import { StorePreview } from './store-preview';

const SWATCHES = ['#2747A8', '#0F766E', '#C2410C', '#7C3AED', '#BE123C', '#16181D'];
const HEX = /^#[0-9a-f]{6}$/i;

/** The hero's report, re-branded live with the visitor's agency name and colour. Once they check a store,
 *  it becomes that store's report as it would start today, with the sample a tap away. */
export function BrandReport({ facts, summary, sections }: { facts: Facts; summary: string; sections: Sections }) {
  const { name, setName, color, setColor, checked, view, setView } = useBrand();
  const agency = name.trim() || facts.agencyName;
  const brand = HEX.test(color) ? color : facts.brandColor;
  // The drafted summary is written in the agency's voice ("we"), so only the header and accents change.
  const branded: Facts = { ...facts, agencyName: agency, brandColor: brand };
  const preview = checked && view === 'store' ? checked : null;
  const looks = checked?.memory.looks.length ?? 0;

  return (
    <figure className="lp-hero-report" id="hero-report">
      <div className="lp-brand-bar" role="group" aria-label="Brand this report">
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

      {checked && (
        <div className="lp-report-switch" role="group" aria-label="Which report to show">
          <button type="button" aria-pressed={!preview} onClick={() => setView('sample')}>
            Sample month
          </button>
          <button type="button" aria-pressed={!!preview} onClick={() => setView('store')}>
            <span className="lp-switch-live" aria-hidden="true" />
            {storeName(checked.scan, checked.memory)}
          </button>
        </div>
      )}

      <div className={`lp-report-frame${preview ? ' is-preview' : ''}`} aria-label={preview ? `Report preview for ${preview.scan.host}` : 'Example client report'}>
        {preview ? (
          <StorePreview key={preview.scan.host + preview.memory.looks.length} checked={preview} agency={agency} brand={brand} />
        ) : (
          <ReportView facts={branded} summary={summary} sections={sections} embedded />
        )}
      </div>
      <figcaption>
        {preview ? (
          <>Built only from {looks === 1 ? 'your check' : `your ${looks} checks`} of {preview.scan.host}, nothing made up. Uptime, checkout and speed fill in once StoreCare is watching.</>
        ) : name.trim() ? (
          <>This is what {agency}’s clients would get on the 1st. Drafted for you; nothing is sent until you approve it.</>
        ) : (
          <>A sample report drafted on 1 November for a fictional store. Type your agency name to brand it, or check a client’s store to see its own.</>
        )}
      </figcaption>
    </figure>
  );
}
