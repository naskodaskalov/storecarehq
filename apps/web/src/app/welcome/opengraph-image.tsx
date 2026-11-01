// The link preview for storecarehq.com: the promise on the left, the report it produces on the right.
// Rendered once at build time, in the site's own typeface (assets/fonts, SIL Open Font License).

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

export const alt = 'StoreCare HQ: know what changed on every client store before your client does. A branded monthly care report for a Shopify store.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const INK = '#16181d';
const TEAL = '#087f75';
const BRAND = '#2747A8';
const MUTED = '#5b616e';
const BODY = '#3b404a';

async function fonts() {
  const dir = join(process.cwd(), 'assets/fonts');
  try {
    const [regular, bold] = await Promise.all([
      readFile(join(dir, 'schibsted-grotesk-latin-400-normal.woff')),
      readFile(join(dir, 'schibsted-grotesk-latin-700-normal.woff')),
    ]);
    return [
      { name: 'Schibsted Grotesk', data: regular, weight: 400 as const, style: 'normal' as const },
      { name: 'Schibsted Grotesk', data: bold, weight: 700 as const, style: 'normal' as const },
    ];
  } catch {
    return undefined; // the default typeface still makes a readable card
  }
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, border: '2px solid #e4e5e8', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ fontSize: 16, color: MUTED }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, color: BRAND, marginTop: 2, letterSpacing: -0.5 }}>{value}</div>
      <div style={{ fontSize: 14, color: MUTED }}>{note}</div>
    </div>
  );
}

function Change({ when, text, note }: { when: string; text: string; note?: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 17, color: BODY, paddingTop: 9, paddingBottom: 9, borderTop: '1px solid #eeeff1' }}>
      <div style={{ width: 66, flex: 'none', color: MUTED }}>{when}</div>
      <div style={{ display: 'flex' }}>
        {text}
        {note && <span style={{ color: MUTED, marginLeft: 6 }}>· {note}</span>}
      </div>
    </div>
  );
}

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: '#f6f8fa', padding: '56px 60px', color: INK, fontFamily: 'Schibsted Grotesk' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: 560, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
            <div style={{ width: 46, height: 46, borderRadius: 11, background: TEAL, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, marginRight: 14 }}>SC</div>
            StoreCare HQ
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 60, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.2 }}>Know what changed on every client store before your client does.</div>
            <div style={{ fontSize: 25, lineHeight: 1.4, color: BODY, marginTop: 24 }}>Monitoring and white-label monthly reports for Shopify care plans. No store access needed.</div>
          </div>
          <div style={{ display: 'flex', fontSize: 22, fontWeight: 700, color: TEAL }}>Check any client’s store free at storecarehq.com</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 44, flex: 1, background: '#fff', borderRadius: 24, padding: '30px 30px 0', border: '2px solid #e4e5e8', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 19, fontWeight: 700 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: BRAND, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>N</div>
            Northline Studio
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: BRAND, letterSpacing: 1.2, marginTop: 20 }}>MONTHLY CARE REPORT · OCTOBER 2026</div>
          <div style={{ fontSize: 38, fontWeight: 700, marginTop: 4, letterSpacing: -0.8 }}>Juniper &amp; Ash</div>
          <div style={{ height: 4, background: BRAND, marginTop: 16, marginBottom: 20, borderRadius: 2 }} />
          <div style={{ display: 'flex', gap: 10 }}>
            <Stat label="Uptime" value="99.93%" note="1,488 checks" />
            <Stat label="Checkout" value="30/31" note="daily tests" />
            <Stat label="Mobile load" value="2.6s" note="−0.8s" />
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, marginTop: 22, marginBottom: 6 }}>Changes to the store</div>
          <Change when="2 Oct" text="Autumn theme published" note="our work" />
          <Change when="17 Oct" text="Smile.io added" />
          <Change when="22 Oct" text="Two unused apps removed" note="our work" />
        </div>
      </div>
    ),
    { ...size, fonts: await fonts() },
  );
}
