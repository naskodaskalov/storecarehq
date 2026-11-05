'use client';

import { useState } from 'react';
import { Icon } from '@/components/icon';
import { contactDay, contactTime, type OutreachContact } from '@/lib/outreach-history';
import { openedByPerson, type ViewSummary } from '@/lib/outreach-report-views';

/** Whether the agency opened the linked reports. Scanner opens are shown apart, since mail security opens every link. */
function Opened({ views, timeZone }: { views: ViewSummary | null | undefined; timeZone: string }) {
  if (views === undefined || views === null) return <span className="outreach-history-sub" title="No report links, or views could not be loaded.">—</span>;
  const scans = views.automated ? <span className="outreach-history-sub" title="Opens by mail-security scanners or link previews, not a person.">{views.automated} link {views.automated === 1 ? 'scan' : 'scans'}</span> : null;
  if (!openedByPerson(views)) return <><span className="outreach-history-sub">Not opened yet</span>{scans}</>;
  const parts = [views.health && `Health check ${views.health}×`, views.sample && `Sample ${views.sample}×`, views.downloads && `${views.downloads} ${views.downloads === 1 ? 'download' : 'downloads'}`].filter(Boolean).join(' · ');
  return <>
    <span className="status-badge success"><Icon name="check" size={12} />Opened</span>
    <span className="outreach-history-sub">{parts}</span>
    {views.last && <span className="outreach-history-sub">Last {contactDay(views.last, timeZone)}, {contactTime(views.last, timeZone)}</span>}
    {scans}
  </>;
}

/** Every outreach email sent from this page, newest first, saved on the server. */
export function OutreachHistory({ contacts, error, timeZone }: { contacts: OutreachContact[]; error: string | null; timeZone: string }) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = q ? contacts.filter((c) => [c.agency_name, c.agency_domain, c.contact_email, c.contact_name ?? '', c.subject].some((v) => v.toLowerCase().includes(q))) : contacts;
  const agencies = new Set(contacts.map((c) => c.agency_domain)).size;
  const opened = contacts.filter((c) => openedByPerson(c.views)).length;

  return <details className="card no-print outreach-history">
    <summary className="outreach-import-heading">
      <span className="outreach-step"><Icon name="clock" size={18} /></span>
      <span><strong>Outreach history</strong><span className="small muted">{error ? 'Unavailable right now' : contacts.length ? `${contacts.length} ${contacts.length === 1 ? 'email' : 'emails'} to ${agencies} ${agencies === 1 ? 'agency' : 'agencies'} · ${opened} opened` : 'Every email you send from this page is saved here'}</span></span>
      <Icon name="chevron" size={17} />
    </summary>
    <div className="outreach-import-content">
      {error ? <p className="outreach-history-error" role="alert"><Icon name="alert" size={16} />{error}</p> : contacts.length === 0 ? <p className="table-empty">No outreach emails yet. Agencies you email will show here, and the page will warn you before writing to one twice.</p> : <>
        <label className="store-search outreach-history-search"><Icon name="search" size={15} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search agency, email or subject" aria-label="Search outreach history" /></label>
        <div className="table-wrap"><table className="outreach-history-table">
          <thead><tr><th>Sent</th><th>Agency</th><th>Contact</th><th>Subject</th><th>Delivery</th><th>Opened</th><th>By</th></tr></thead>
          <tbody>{visible.map((c) => <tr key={c.id}>
            <td><span className="outreach-history-day">{contactDay(c.sent_at, timeZone)}</span><span className="outreach-history-sub">{contactTime(c.sent_at, timeZone)}</span></td>
            <td><strong>{c.agency_name}</strong><a className="outreach-history-sub" href={c.agency_url} target="_blank" rel="noreferrer">{c.agency_domain}</a></td>
            <td>{c.contact_name && <span>{c.contact_name}</span>}<span className="outreach-history-sub">{c.contact_email}</span></td>
            <td className="outreach-history-subject">{c.subject}</td>
            <td>{c.delivery === 'accepted' ? <span className="status-badge success"><Icon name="check" size={12} />Sent</span> : <span className="status-badge warning" title="The provider did not confirm acceptance; the email may have gone out."><Icon name="alert" size={12} />Unconfirmed</span>}</td>
            <td><Opened views={c.views} timeZone={timeZone} /></td>
            <td className="outreach-history-sub">{c.sent_by}</td>
          </tr>)}</tbody>
        </table></div>
        {q && !visible.length && <p className="table-empty">Nothing in the history matches “{query.trim()}”.</p>}
      </>}
    </div>
  </details>;
}
