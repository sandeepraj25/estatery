'use client';

import { ArrowRight, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { Notice, TextArea, TextField, Toggle } from './fields';

export interface RedirectRow { id: string; from: string; to: string; permanent: boolean; createdAt: string }

export function RedirectsManager({ items, max }: { items: RedirectRow[]; max: number }) {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [permanent, setPermanent] = useState(true);
  const [bulk, setBulk] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy('add');
    setNotice(null);
    setErrors({});
    try {
      const r = await adminRequest<{ from: string; to: string }>('admin/redirects', { method: 'POST', body: { from, to, permanent } });
      setNotice({ tone: 'success', text: `Visitors to ${r.from} now go to ${r.to}.` });
      setFrom('');
      setTo('');
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
        setNotice({ tone: 'error', text: err.message });
      } else setNotice({ tone: 'error', text: 'The redirect wasn’t added. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function importBulk() {
    setBusy('bulk');
    setNotice(null);
    try {
      const r = await adminRequest<{ added: number; errors: Array<{ line: number; text: string; reason: string }> }>('admin/redirects/bulk', { method: 'POST', body: { text: bulk, permanent: true } });
      setNotice({
        tone: r.errors.length ? 'error' : 'success',
        text: `Added ${r.added} redirect${r.added === 1 ? '' : 's'}.${r.errors.length ? ` ${r.errors.length} line${r.errors.length === 1 ? ' needs' : 's need'} fixing:` : ''}`,
        list: r.errors.slice(0, 20).map((x) => `Line ${x.line} (${x.text}): ${x.reason}`),
      });
      setBulk(r.errors.map((x) => x.text).join('\n'));
      router.refresh();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof AdminRequestError ? err.message : 'Nothing was imported. Please try again.' });
    } finally {
      setBusy(null);
    }
  }

  async function remove(r: RedirectRow) {
    if (!window.confirm(`Remove the redirect from ${r.from}? Visitors to that address will see “page not found”.`)) return;
    setBusy(r.id);
    try {
      await adminRequest(`admin/redirects/${r.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof AdminRequestError ? err.message : 'The redirect wasn’t removed.' });
    } finally {
      setBusy(null);
    }
  }

  const shown = filter ? items.filter((r) => r.from.includes(filter.toLowerCase()) || r.to.toLowerCase().includes(filter.toLowerCase())) : items;
  return (
    <div className="space-y-6">
      {notice && (
        <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
          {notice.list && notice.list.length > 0 && <ul className="mt-1 list-disc pl-5">{notice.list.map((l) => <li key={l}>{l}</li>)}</ul>}
        </Notice>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <form onSubmit={add} className="space-y-4 rounded-[14px] border border-line bg-white p-5">
          <h2 className="font-heading font-semibold">Add a redirect</h2>
          <TextField label="Old address" value={from} onChange={setFrom} placeholder="/old-listing.html" error={errors.from} hint="The path from your previous website, starting with /." />
          <TextField label="Send visitors to" value={to} onChange={setTo} placeholder="/properties/the-glasshouse-alibaug" error={errors.to} hint="A page on this site, or a full https:// address." />
          <Toggle label="Permanent (301)" hint="Tells search engines to move the old page’s ranking here. Turn off for short-term moves." checked={permanent} onChange={setPermanent} />
          <button type="submit" disabled={!from.trim() || !to.trim() || busy === 'add'} className="btn btn-primary min-h-10 disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add redirect'}</button>
        </form>
        <div className="space-y-4 rounded-[14px] border border-line bg-white p-5">
          <h2 className="font-heading font-semibold">Paste a list</h2>
          <TextArea label="One redirect per line" value={bulk} onChange={setBulk} rows={7} hint="Old address, a space, then the new address. Useful when moving a whole website. Lines that can’t be added stay here with the reason." />
          <button type="button" onClick={importBulk} disabled={!bulk.trim() || busy === 'bulk'} className="btn btn-ghost min-h-10 disabled:opacity-50">{busy === 'bulk' ? 'Adding…' : 'Add all as permanent'}</button>
        </div>
      </div>

      <section className="rounded-[14px] border border-line bg-white" aria-labelledby="redirect-list">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id="redirect-list" className="font-heading font-semibold">Redirects <span className="font-normal text-muted">{items.length} of {max}</span></h2>
          {items.length > 8 && (
            <div className="w-64">
              <label htmlFor="filter-redirects" className="sr-only">Filter redirects</label>
              <input id="filter-redirects" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="field h-10 min-h-10" />
            </div>
          )}
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">No redirects yet. Add the addresses of your old website so existing links and search results keep working.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                <code className="min-w-0 truncate rounded bg-ivory px-2 py-0.5">{r.from}</code>
                <ArrowRight className="size-4 shrink-0 text-muted" aria-label="goes to" />
                <code className="min-w-0 flex-1 truncate">{r.to}</code>
                <span className="shrink-0 text-xs text-muted">{r.permanent ? '301' : '302'}</span>
                <button type="button" disabled={busy === r.id} onClick={() => remove(r)} className="grid size-8 shrink-0 place-items-center rounded-md text-[var(--color-error)] hover:bg-[var(--color-error)]/8" aria-label={`Remove redirect from ${r.from}`}><Trash2 className="size-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
