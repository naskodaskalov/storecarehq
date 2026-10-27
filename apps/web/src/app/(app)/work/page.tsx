import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { workEntryExplains } from '@storecare/storefront';
import { requireAgency, monthStart } from '@/lib/data';
import { supabaseServer } from '@/lib/supabase';
import { hours } from '@/lib/format';

async function logWork(formData: FormData) {
  'use server';
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const storeId = String(formData.get('store'));
  const { data: store } = await supabase.from('stores').select('id, agency_id').eq('id', storeId).single();
  if (!store || !user) redirect('/work');

  const date = String(formData.get('date') || new Date().toISOString().slice(0, 10));
  const title = String(formData.get('title') ?? '').trim();
  const minutes = Math.round(Number(formData.get('hours') || 0) * 60);
  if (!title || minutes <= 0) redirect(`/work?store=${storeId}&error=1`);

  const { data: entry } = await supabase
    .from('work_entries')
    .insert({
      store_id: storeId,
      agency_id: store.agency_id,
      user_id: user.id,
      work_date: date,
      minutes,
      title,
      client_text: String(formData.get('client_text') ?? '') || null,
      counts_to_plan: formData.get('counts') === 'on',
    })
    .select('id, title, client_text')
    .single();

  // Link detected changes from the day before to the day after that this entry explains.
  if (entry) {
    const d = new Date(`${date}T00:00:00Z`);
    const from = new Date(d.getTime() - 864e5).toISOString();
    const to = new Date(d.getTime() + 2 * 864e5).toISOString();
    const { data: changes } = await supabase
      .from('changes')
      .select('id, kind, summary')
      .eq('store_id', storeId)
      .is('work_entry_id', null)
      .gte('occurred_at', from)
      .lt('occurred_at', to);
    const text = `${entry.title} ${entry.client_text ?? ''}`;
    const ids = (changes ?? []).filter((c) => workEntryExplains(c, text)).map((c) => c.id);
    if (ids.length) await supabase.from('changes').update({ work_entry_id: entry.id }).in('id', ids);
  }
  revalidatePath('/work');
  redirect(`/work?store=${storeId}&saved=1`);
}

export default async function Work({ searchParams }: { searchParams: Promise<{ store?: string; saved?: string; error?: string }> }) {
  const { store: selected, saved, error } = await searchParams;
  const { agency } = await requireAgency();
  const supabase = await supabaseServer();
  const [{ data: stores }, { data: entries }] = await Promise.all([
    supabase.from('stores').select('id, name').eq('agency_id', agency.id).order('name'),
    supabase
      .from('work_entries')
      .select('id, work_date, minutes, title, client_text, counts_to_plan, store_id, stores(name)')
      .eq('agency_id', agency.id)
      .gte('work_date', monthStart())
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ]);

  return (
    <>
      <h1>Work log</h1>
      <section className="card">
        <h2>Log time</h2>
        {!stores?.length ? (
          <p className="muted" style={{ margin: 0 }}>Add a store first.</p>
        ) : (
          <form action={logWork} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
              <div className="field">
                <label htmlFor="store">Store</label>
                <select id="store" name="store" defaultValue={selected ?? stores[0].id}>
                  {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="date">Date</label>
                <input id="date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="field">
                <label htmlFor="hours">Hours</label>
                <input id="hours" name="hours" type="number" min="0.25" step="0.25" defaultValue="0.5" className="mono" />
              </div>
            </div>
            <div className="field">
              <label htmlFor="title">What did you do?</label>
              <input id="title" name="title" type="text" placeholder="Published autumn theme after testing checkout" required />
            </div>
            <div className="field">
              <label htmlFor="client_text">How to describe it to the client <span className="muted" style={{ fontWeight: 400 }}>(optional, used in the report)</span></label>
              <textarea id="client_text" name="client_text" />
            </div>
            <div className="row">
              <label className="check" style={{ alignItems: 'center' }}><input type="checkbox" name="counts" defaultChecked style={{ marginTop: 0 }} /> Counts toward the care plan</label>
              <button className="btn" type="submit">Save entry</button>
            </div>
            {saved && <div className="small tone-good">Saved. Matching detected changes were linked to it.</div>}
            {error && <div className="error">Add a description and the time spent.</div>}
          </form>
        )}
      </section>

      <section className="card">
        <h2>This month</h2>
        <div className="table-wrap">
          <table style={{ minWidth: 640 }}>
            <thead><tr><th>Date</th><th>Store</th><th>Work</th><th>Hours</th></tr></thead>
            <tbody>
              {(entries ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="mono small">{e.work_date}</td>
                  <td>{(e.stores as unknown as { name: string } | null)?.name}</td>
                  <td>{e.title}{e.client_text && <div className="small muted">{e.client_text}</div>}</td>
                  <td className="mono">{hours(e.minutes)}{!e.counts_to_plan && <span className="small muted"> (not billed)</span>}</td>
                </tr>
              ))}
              {!entries?.length && <tr><td colSpan={4} className="muted">Nothing logged this month yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
