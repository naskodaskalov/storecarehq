'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from './icon';

export type DashboardStore = {
  id: string; name: string; domain: string; score: number | null; status: string;
  attention: boolean; checkout: { result: string; time: string } | null;
  used: number; included: number; report: { id: string; status: string; period: string } | null;
};

export function StoreTable({ stores }: { stores: DashboardStore[] }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const tabs = [
    { id: 'all', label: 'All stores', count: stores.length },
    { id: 'attention', label: 'Needs attention', count: stores.filter((s) => s.attention).length },
    { id: 'limited', label: 'Limited monitoring', count: stores.filter((s) => s.status === 'limited').length },
  ];
  const visible = stores.filter((s) => `${s.name} ${s.domain}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || (filter === 'attention' ? s.attention : s.status === 'limited')));
  return (
    <section className="store-panel" id="client-stores" aria-labelledby="stores-title">
      <div className="store-panel-heading"><h2 id="stores-title">Client stores</h2><label className="store-search"><Icon name="search" size={17} /><span className="sr-only">Search stores</span><input type="search" placeholder="Search stores…" value={query} onChange={(e) => setQuery(e.target.value)} /></label></div>
      <div className="store-filters" aria-label="Filter stores">{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)}>{tab.label}<span>{tab.count}</span></button>)}</div>
      <div className="table-wrap"><table className="stores-table"><thead><tr><th>Store</th><th>Health</th><th>Checkout <span className="column-note">· last 24h</span></th><th>Hours used <span className="column-note">· this month</span></th><th>Latest report</th><th><span className="sr-only">Open store</span></th></tr></thead>
        <tbody>{visible.map((s) => {
          const tone = s.status === 'paused' || s.score === null ? 'neutral' : s.score >= 90 ? 'success' : s.score >= 75 ? 'warning' : 'danger';
          const label = s.status === 'paused' ? 'Paused' : s.score === null ? 'Pending' : s.score >= 90 ? 'Healthy' : s.score >= 75 ? 'Attention' : 'At risk';
          const checkoutTone = s.checkout?.result === 'pass' ? 'success' : s.checkout?.result === 'fail' ? 'danger' : 'neutral';
          const over = s.included > 0 && s.used > s.included;
          const avatar = [...s.name].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
          return <tr key={s.id}>
            <td><div className="store-identity"><span className={`store-avatar avatar-${avatar}`}>{s.name.split(/\s|&/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('')}</span><div><Link href={`/stores/${s.id}`} className="store-name">{s.name}</Link><div className="store-domain">{s.domain}</div>{s.status === 'limited' && <div className="limited-label">Limited monitoring</div>}</div></div></td>
            <td><span className={`status-badge ${tone}`}>{s.status !== 'paused' && s.score !== null && <strong>{s.score}</strong>}{label}</span></td>
            <td><div className="checkout-result"><span className={`result-icon ${checkoutTone}`}><Icon size={12} name={s.checkout?.result === 'pass' ? 'check' : s.checkout?.result === 'fail' ? 'close' : 'minus'} /></span><span>{s.checkout ? s.checkout.result === 'pass' ? 'Passed' : s.checkout.result === 'fail' ? 'Failed' : 'Blocked' : 'No recent test'}</span>{s.checkout && <span className="checkout-time">{s.checkout.time}</span>}</div></td>
            <td><div className={`plan-usage${over ? ' over-plan' : ''}`}><span>{s.used.toFixed(1)} <span className="muted">/ {s.included || '—'}</span></span>{s.included > 0 && <progress value={s.used} max={s.included} aria-label={`${s.name}: ${s.used.toFixed(1)} of ${s.included} hours used${over ? ', over plan' : ''}`} />}</div></td>
            <td>{s.report ? <Link href={`/reports/${s.report.id}`} className={`status-badge report-badge ${s.report.status === 'sent' ? 'success' : 'neutral'}`} title={`Report period: ${s.report.period}`}><Icon name="report" size={14} />{s.report.status === 'sent' ? 'Sent' : s.report.status === 'approved' ? 'Approved' : 'Draft ready'}</Link> : <span className="muted small">No report yet</span>}</td>
            <td><Link href={`/stores/${s.id}`} className="store-open" aria-label={`Open ${s.name}`}><Icon name="chevron" size={16} /></Link></td>
          </tr>;
        })}</tbody></table></div>
      {!visible.length && <div className="table-empty">No stores match your search or filter.<button type="button" className="text-button" onClick={() => { setQuery(''); setFilter('all'); }}>Clear filters</button></div>}
      <footer className="store-panel-footer"><span>{visible.length} of {stores.length} stores</span><span className="monitoring-note"><span className="demo-dot" />Public storefront monitoring</span></footer>
    </section>
  );
}
