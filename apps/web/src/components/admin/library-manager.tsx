'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn, formatPrice } from '@/lib/format';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { Notice } from './fields';
import type { FieldSpec } from './site/section-specs';
import { SpecForm } from './site/spec-form';
import { SortableList } from './sortable';
import { EmptyState, Panel } from './ui';

import type { Kind } from './library-tabs';
type Item = Record<string, unknown> & { id: string };

const KINDS: Record<Kind, { label: string; singular: string; description: string; fields: FieldSpec[]; blank: Record<string, unknown>; title: (i: Item) => string; meta: (i: Item) => string; image?: (i: Item) => string | undefined }> = {
  agents: {
    label: 'Advisors', singular: 'advisor', description: 'Public profiles shown on the homepage and on the listings they handle.',
    fields: [
      { k: 'name', label: 'Name', kind: 'text', max: 80 }, { k: 'title', label: 'Title', kind: 'text', max: 80, hint: 'e.g. Senior Advisor · South Mumbai' },
      { k: 'photoUrl', label: 'Portrait', kind: 'image', hint: 'A portrait (4:5) photo works best.' },
      { k: 'phone', label: 'Phone', kind: 'text', max: 20 }, { k: 'email', label: 'Email', kind: 'text', max: 120 },
      { k: 'yearsExperience', label: 'Years of experience', kind: 'number', min: 0, max: 70 },
      { k: 'active', label: 'Show on the website', kind: 'toggle' },
    ],
    blank: { name: '', title: '', photoUrl: '', phone: '', email: '', specialities: [], languages: [], yearsExperience: 0, active: true },
    title: (i) => i.name as string, meta: (i) => `${i.title || 'Advisor'}${i.active === false ? ' · hidden' : ''}`, image: (i) => i.photoUrl as string,
  },
  testimonials: {
    label: 'Testimonials', singular: 'testimonial', description: 'Client stories for the homepage. Only publish quotes your clients agreed to share.',
    fields: [
      { k: 'quote', label: 'Quote', kind: 'textarea', max: 600 }, { k: 'author', label: 'Client name', kind: 'text', max: 80 },
      { k: 'context', label: 'Context', kind: 'text', max: 120, hint: 'e.g. Bought a villa in Alibaug' },
      { k: 'rating', label: 'Rating (1–5)', kind: 'number', min: 1, max: 5 }, { k: 'published', label: 'Show on the website', kind: 'toggle' },
    ],
    blank: { quote: '', author: '', context: '', rating: 5, published: true },
    title: (i) => i.author as string, meta: (i) => `“${String(i.quote).slice(0, 80)}${String(i.quote).length > 80 ? '…' : ''}”${i.published === false ? ' · hidden' : ''}`,
  },
  locations: {
    label: 'Destinations', singular: 'destination', description: 'Tiles in “Explore by destination”. The city must match the city on your listings.',
    fields: [
      { k: 'name', label: 'Name', kind: 'text', max: 60 }, { k: 'city', label: 'City (as used on listings)', kind: 'text', max: 60 },
      { k: 'blurb', label: 'Short description', kind: 'textarea', max: 200 }, { k: 'image', label: 'Photo', kind: 'image' },
    ],
    blank: { name: '', city: '', blurb: '', image: '' },
    title: (i) => i.name as string, meta: (i) => `Links to listings in ${i.city}`, image: (i) => i.image as string,
  },
  projects: {
    label: 'Projects', singular: 'project', description: 'Developments shown in “New projects”. Listings can be linked to a project.',
    fields: [
      { k: 'name', label: 'Project name', kind: 'text', max: 80 }, { k: 'developer', label: 'Developer', kind: 'text', max: 120 },
      { k: 'city', label: 'City', kind: 'text', max: 60 }, { k: 'locality', label: 'Locality', kind: 'text', max: 80 },
      { k: 'status', label: 'Stage', kind: 'select', options: [{ value: 'pre-launch', label: 'Pre-launch' }, { value: 'under-construction', label: 'Under construction' }, { value: 'ready-to-move', label: 'Ready to move' }] },
      { k: 'possession', label: 'Possession', kind: 'text', max: 40, hint: 'e.g. Dec 2028' },
      { k: 'startingPrice', label: 'Starting price (₹)', kind: 'number', min: 0, max: 1e12 },
      { k: 'configurations', label: 'Configurations', kind: 'text', max: 120, hint: 'e.g. 3, 4 & 5 BHK residences' },
      { k: 'summary', label: 'Summary', kind: 'textarea', max: 300 }, { k: 'image', label: 'Photo', kind: 'image' },
      { k: 'featured', label: 'Show first', kind: 'toggle' },
    ],
    blank: { name: '', developer: '', city: '', locality: '', status: 'under-construction', possession: '', startingPrice: 0, configurations: '', summary: '', image: '', featured: false },
    title: (i) => i.name as string, meta: (i) => `${i.locality ? `${i.locality}, ` : ''}${i.city} · from ${formatPrice(Number(i.startingPrice))}`, image: (i) => i.image as string,
  },
};

export function LibraryManager({ kind, items: initial, canEdit }: { kind: Kind; items: Item[]; canEdit: boolean }) {
  const router = useRouter();
  const cfg = KINDS[kind];
  const [items, setItems] = useState(initial);
  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  function open(item: Item | 'new') {
    setEditing(item);
    setErrors({});
    setForm(item === 'new' ? { ...cfg.blank } : Object.fromEntries(Object.keys(cfg.blank).map((k) => [k, item[k] ?? cfg.blank[k]])));
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      if (editing === 'new') {
        const created = await adminRequest<Item>(`admin/library/${kind}`, { method: 'POST', body: form });
        setItems((x) => [...x, created]);
      } else if (editing) {
        const updated = await adminRequest<Item>(`admin/library/${kind}/${editing.id}`, { method: 'PUT', body: form });
        setItems((x) => x.map((i) => (i.id === updated.id ? updated : i)));
      }
      setEditing(null);
      setNotice({ tone: 'success', text: 'Saved. Changes appear on the website right away.' });
      router.refresh();
    } catch (e) {
      if (e instanceof AdminRequestError) setErrors(Object.fromEntries(e.fields.map((f) => [f.path === 'image' && kind === 'agents' ? 'photoUrl' : f.path, f.message])));
      else setErrors({ _: 'That didn’t save. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: Item) {
    if (!window.confirm(`Delete “${cfg.title(item)}”? This can’t be undone.`)) return;
    try {
      await adminRequest(`admin/library/${kind}/${item.id}`, { method: 'DELETE' });
      setItems((x) => x.filter((i) => i.id !== item.id));
      router.refresh();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'That couldn’t be deleted.' });
    }
  }

  async function reorder(next: Item[]) {
    const before = items;
    setItems(next);
    try {
      await adminRequest(`admin/library/${kind}/reorder`, { method: 'POST', body: { ids: next.map((i) => i.id) } });
    } catch (e) {
      setItems(before);
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'The new order didn’t save.' });
    }
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{cfg.description} Changes here are live immediately; they don’t go through publishing.</p>
        {canEdit && <button type="button" onClick={() => open('new')} className="btn btn-primary min-h-10"><Plus className="size-4" aria-hidden="true" />Add {cfg.singular}</button>}
      </div>
      {notice && <div className="mb-4"><Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice></div>}
      {items.length === 0 ? (
        <Panel><EmptyState title={`No ${cfg.label.toLowerCase()} yet`} body={canEdit ? `Add your first ${cfg.singular} to show it on the website.` : undefined} /></Panel>
      ) : (
        <SortableList
          label={cfg.label}
          items={items}
          onReorder={canEdit ? reorder : () => undefined}
          render={(item, handle) => (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-white p-2 pr-3">
              {canEdit && handle}
              {cfg.image && (
                <div className="media-fallback relative size-12 shrink-0 overflow-hidden rounded-lg">
                  {cfg.image(item) && <Image src={cfg.image(item)!} alt="" fill sizes="48px" className="object-cover" />}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className={cn('truncate font-medium', (item.active === false || item.published === false) && 'text-muted')}>{cfg.title(item)}</p>
                <p className="truncate text-sm text-muted">{cfg.meta(item)}</p>
              </div>
              {canEdit && (
                <>
                  <button type="button" onClick={() => open(item)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-ivory hover:text-ink" aria-label={`Edit ${cfg.title(item)}`}><Pencil className="size-4" /></button>
                  <button type="button" onClick={() => remove(item)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-[var(--color-error)]/8 hover:text-[var(--color-error)]" aria-label={`Delete ${cfg.title(item)}`}><Trash2 className="size-4" /></button>
                </>
              )}
            </div>
          )}
        />
      )}

      <Dialog.Root open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
          <Dialog.Content className="fixed inset-y-0 right-0 z-[61] flex w-[min(34rem,100vw)] flex-col bg-white shadow-lift outline-none">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <Dialog.Title className="font-heading text-lg font-semibold">{editing === 'new' ? `Add ${cfg.singular}` : `Edit ${cfg.singular}`}</Dialog.Title>
              <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{cfg.description}</Dialog.Description>
            <div className="flex-1 overflow-y-auto p-5">
              {errors._ && <div className="mb-4"><Notice tone="error">{errors._}</Notice></div>}
              <SpecForm fields={cfg.fields} value={form} onChange={setForm} errors={errors} />
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
              <button type="button" onClick={save} disabled={busy} className="btn btn-primary min-h-10">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

