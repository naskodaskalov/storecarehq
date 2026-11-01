'use client';

import { useState } from 'react';

const HEX = /^#[0-9a-f]{6}$/i;

/** Brand colour + logo inputs with a live preview of a client report header. */
export function BrandFields({ agencyName, brandColor, logoUrl }: { agencyName: string; brandColor: string; logoUrl: string | null }) {
  const [color, setColor] = useState(brandColor);
  const [logo, setLogo] = useState(logoUrl ?? '');
  const [logoBroken, setLogoBroken] = useState(false);
  const swatch = HEX.test(color) ? color : brandColor;
  const showLogo = logo.startsWith('https://') && !logoBroken;

  return (
    <div className="brand-settings">
      <div className="brand-settings-fields">
        <div className="field">
          <label htmlFor="brand_color_text">Brand colour</label>
          <div className="color-input">
            <input type="color" aria-label="Pick brand colour" value={swatch} onChange={(e) => setColor(e.target.value.toUpperCase())} />
            <input id="brand_color_text" name="brand_color" type="text" value={color} onChange={(e) => setColor(e.target.value)} className="mono" maxLength={7} spellCheck={false} />
          </div>
          <span className="small muted">Used for headings and accents in client reports.</span>
        </div>
        <div className="field">
          <label htmlFor="logo_url">Logo address <span className="muted" style={{ fontWeight: 400 }}>(optional)</span></label>
          <input id="logo_url" name="logo_url" type="url" value={logo} onChange={(e) => { setLogo(e.target.value); setLogoBroken(false); }} placeholder="https://yourdomain.com/logo.png" />
          <span className="small muted">A public https:// link to a PNG or SVG. Wide logos look best, around 320×80.</span>
        </div>
      </div>

      <figure className="brand-preview" aria-label="Report header preview">
        <figcaption className="small muted">Client report preview</figcaption>
        <div className="brand-preview-card">
          <div className="brand-preview-bar" style={{ background: swatch }} />
          <div className="brand-preview-head">
            {showLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={logo} alt="" onError={() => setLogoBroken(true)} />
              : <span className="brand-preview-mark" style={{ background: swatch }}>{initials(agencyName)}</span>}
            <div>
              <div className="brand-preview-title">Monthly care report</div>
              <div className="small muted">Prepared by {agencyName || 'your agency'}</div>
            </div>
          </div>
          <div className="brand-preview-stats">
            <div><strong style={{ color: swatch }}>99.98%</strong><span>Uptime</span></div>
            <div><strong style={{ color: swatch }}>6.5 h</strong><span>Work done</span></div>
            <div><strong style={{ color: swatch }}>14</strong><span>Changes</span></div>
          </div>
          {logo && logoBroken && <p className="small warn" style={{ margin: 0 }}>That logo could not be loaded. Check the link opens an image.</p>}
        </div>
      </figure>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'SC';
}
