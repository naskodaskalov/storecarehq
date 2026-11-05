// The BFCM readiness one-pager: in the app, on the client's /r/audit/<token> link and, for prospects, on the
// outreach link. What the agency shares is exactly what the client sees. Laid out to print on one A4 or Letter page.

import { CHECK_LABELS, headline, longDate, shortDate, type AuditItem, type BfcmAudit, type Tone } from '@/lib/bfcm';

const MARK: Record<Tone, string> = { fix: '!', look: '?', good: '✓', unknown: '–' };
const SAY: Record<Tone, string> = { fix: 'Fix before the sale', look: 'Worth a look', good: 'Fine', unknown: 'Not checked' };
const VERDICT: Record<BfcmAudit['verdict'], string> = { fix: 'Needs work before the sale', look: 'Ready, with notes', ready: 'Ready', partial: 'Not fully checked' };

export type OnePagerBrand = { name: string; brandColor?: string | null; logoUrl?: string | null };

export function BfcmOnePager({
  audit,
  brand,
  note,
  preparedFor,
  embedded = false,
}: {
  audit: BfcmAudit;
  /** Who prepared it: the agency in the app and on client links, StoreCare HQ on outreach links. */
  brand: OnePagerBrand;
  note?: string | null;
  /** Outreach: the agency the one-pager was prepared for. */
  preparedFor?: string;
  /** Inside another page whose main heading is not the store's name. */
  embedded?: boolean;
}) {
  const Title = embedded ? 'h2' : 'h1';
  const color = brand.brandColor && /^#[0-9a-f]{6}$/i.test(brand.brandColor) ? brand.brandColor : '#2747A8';
  const checked = Date.parse(audit.checkedAt);
  const daysBefore = Math.round((Date.parse(`${audit.sale.blackFriday}T00:00:00Z`) - Date.UTC(new Date(checked).getUTCFullYear(), new Date(checked).getUTCMonth(), new Date(checked).getUTCDate())) / 864e5);
  const fixes = audit.items.filter((i) => i.tone === 'fix');
  const logo = brand.logoUrl && /^https:\/\//.test(brand.logoUrl) ? brand.logoUrl : null;

  return (
    <article className={`bfcm-sheet is-${audit.verdict}`} style={{ ['--brand' as string]: color }} aria-label={`Black Friday readiness: ${audit.storeName}`}>
      <header className="bfcm-sheet-head">
        <div className="report-agency bfcm-sheet-agency">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt={brand.name} style={{ height: 30 }} />
          ) : (
            <span className="report-mark">{brand.name.slice(0, 1).toUpperCase()}</span>
          )}
          <span>{brand.name}</span>
        </div>
        <div className="report-kicker">Black Friday readiness{preparedFor ? ` · prepared for ${preparedFor}` : ''}</div>
        <Title className="report-title">{audit.storeName}</Title>
        <div className="report-sub">{audit.host} · checked {longDate(audit.checkedAt)}</div>
      </header>

      <section className="bfcm-verdict" aria-label="Result">
        <div>
          <div className="bfcm-verdict-label">{VERDICT[audit.verdict]}</div>
          <p className="bfcm-verdict-headline">{headline(audit)}</p>
        </div>
        <div className="bfcm-countdown">
          {daysBefore > 0 ? <><strong>{daysBefore}</strong><span>day{daysBefore === 1 ? '' : 's'} before Black Friday</span></> : <strong className="bfcm-countdown-word">Sale weekend</strong>}
          <span className="bfcm-countdown-dates">{shortDate(audit.sale.blackFriday)} – {shortDate(audit.sale.cyberMonday)}</span>
        </div>
      </section>

      {fixes.length > 0 && (
        <section className="bfcm-fixes">
          <h2>Fix before the sale</h2>
          <ol>{fixes.map((i) => <li key={i.key}><strong>{CHECK_LABELS[i.key]}.</strong> {i.text}</li>)}</ol>
        </section>
      )}

      <section className="bfcm-checks">
        <h2>What we checked</h2>
        <ul>{audit.items.map((i) => <Check key={i.key} item={i} />)}</ul>
      </section>

      {note?.trim() && (
        <section className="bfcm-note">
          <h2>From {brand.name}</h2>
          {note.trim().split(/\n+/).map((p, n) => <p key={n}>{p}</p>)}
        </section>
      )}

      <footer className="report-foot bfcm-sheet-foot">
        Prepared by {brand.name} · {audit.kind === 'prospect' ? 'One outside look at the public storefront, no store access' : 'Public storefront checks and daily monitoring, no store access'} · StoreCare HQ
      </footer>
    </article>
  );
}

function Check({ item }: { item: AuditItem }) {
  return (
    <li className={`bfcm-check tone-${item.tone}`}>
      <span className="bfcm-check-mark" aria-hidden="true">{MARK[item.tone]}</span>
      <div>
        <div className="bfcm-check-label">{CHECK_LABELS[item.key]}<span className="bfcm-check-tone">{SAY[item.tone]}</span></div>
        <p>{item.text}</p>
      </div>
    </li>
  );
}
