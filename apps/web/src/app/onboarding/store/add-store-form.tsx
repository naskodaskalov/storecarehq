'use client';

import { useActionState, useEffect, useState } from 'react';
import { addStore, checkStore, type StoreCheck } from '../actions';

const LIMITED: Record<string, string> = {
  blocked: 'This store shows bots a verification page. We will track uptime and speed only; your client can allow StoreCareBot.',
  headless: 'This store uses a custom frontend, so theme and app changes are not visible.',
  no_product_feed: 'The store hides its product feed, so product and price changes will not be tracked.',
};

export function AddStoreForm({ error }: { error?: string }) {
  const [check, runCheck, checking] = useActionState<StoreCheck | null, FormData>(checkStore, null);
  const [tz, setTz] = useState('UTC');
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'), []);

  return (
    <>
      <form action={runCheck} style={{ border: '2px solid var(--accent)', borderRadius: 12, padding: 22, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: '1 1 280px' }}>
            <label htmlFor="url">Store URL</label>
            <input id="url" name="url" type="text" placeholder="clientstore.com" required className="mono" defaultValue={check?.url.replace(/^https:\/\//, '')} />
          </div>
          <button className="btn" type="submit" disabled={checking}>{checking ? 'Checking…' : 'Check store'}</button>
        </div>
        {check && !check.ok && <div className="error">{check.message}</div>}
        {check?.ok && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14 }}>
            <div><span className="tone-good" style={{ fontWeight: 700 }}>✓</span> Shopify store found{check.theme ? ` · theme ${check.theme}` : ''}</div>
            <div className="muted">
              {check.productsVisible ? `Products visible${check.productCount !== null ? ` (${check.productCount}${check.productCount >= 250 ? '+' : ''})` : ''}` : 'Products not visible'} · {check.apps} apps detected
            </div>
            {check.limited && <div className="notice small">{LIMITED[check.limited]}</div>}
          </div>
        )}
      </form>

      {check?.ok && (
        <form action={addStore} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <input type="hidden" name="url" value={check.url} />
          <input type="hidden" name="handle" value={check.handle ?? ''} />
          <input type="hidden" name="tz" value={tz} />
          <div className="field">
            <label htmlFor="name">Store name</label>
            <input id="name" name="name" type="text" defaultValue={check.name} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
            <div className="field">
              <label htmlFor="contact_name">Client contact</label>
              <input id="contact_name" name="contact_name" type="text" placeholder="Maya Ortiz" />
            </div>
            <div className="field">
              <label htmlFor="contact_email">Their email <span className="muted" style={{ fontWeight: 400 }}>(gets the monthly report)</span></label>
              <input id="contact_email" name="contact_email" type="email" placeholder="owner@clientstore.com" />
            </div>
          </div>
          <div className="panel">
            <strong style={{ fontSize: 15 }}>Daily checkout test</strong>
            <span className="small muted">
              Once a day a test visitor adds a product to the cart and opens the checkout page. It stops there: nothing is typed in,
              so no order, customer or abandoned-checkout email is created. Visits show up as StoreCareBot.
            </span>
            <label className="check">
              <input type="checkbox" name="consent" defaultChecked={!check.limited} />
              <span>We look after this store, and the client agrees to a daily test visit to their checkout.</span>
            </label>
          </div>
          {error && <div className="error">{error}</div>}
          <div className="row">
            <span className="small muted">StoreCare only reads the public storefront. No app to install.</span>
            <button className="btn" type="submit">Add store</button>
          </div>
        </form>
      )}
    </>
  );
}
