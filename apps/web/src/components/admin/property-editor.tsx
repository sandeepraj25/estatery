'use client';

import { Archive, CheckCircle2, Circle, ExternalLink, Eye, ImagePlus, Star, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  LISTING_TYPES, PROPERTY_CATEGORIES, PROPERTY_TYPE_LABELS, PROPERTY_TYPES, propertyInputSchema, publishProblems, slugify,
  type PropertyInputParsed, type PropertyStatus,
} from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn, formatPrice } from '@/lib/format';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { FormSection, Notice, SelectField, TagsField, TextArea, TextField, Toggle, useUnsavedGuard } from './fields';
import { MediaPickerDialog } from './media-picker';
import { SortableList } from './sortable';
import { PropertyStatusBadge } from './ui';

export interface EditablePropertyDto extends PropertyInputParsed {
  id: string;
  status: PropertyStatus;
  publishedAt: string | null;
  updatedAt: string;
  previousSlugs: string[];
  publishProblems: string[];
  allowedTransitions: PropertyStatus[];
}

const AMENITY_SUGGESTIONS = ['Private pool', 'Garden', 'Gym', 'Clubhouse', 'Power backup', 'Lift', '24×7 security', 'Covered parking', 'EV charging', 'Sea view', 'Furnished', 'Home automation', 'Terrace', 'Pet friendly'];

const EMPTY: PropertyInputParsed = {
  title: '', slug: '', summary: '', description: '', listingType: 'sale', category: 'residential', type: 'apartment', price: 0, bhk: null, bathrooms: null,
  areaSqft: 0, location: { locality: '', city: '', state: '', lat: null, lng: null }, amenities: [], images: [], featured: false, verified: false, agentId: null, projectId: null,
};

const STATUS_ACTIONS: Record<PropertyStatus, string> = { published: 'Publish', draft: 'Unpublish', sold: 'Mark as sold', rented: 'Mark as rented', archived: 'Archive' };

export function PropertyEditor({ initial, agents, projects, canEdit }: {
  initial: EditablePropertyDto | null; agents: Array<{ id: string; name: string }>; projects: Array<{ id: string; name: string }>; canEdit: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<EditablePropertyDto | null>(initial);
  const [form, setForm] = useState<PropertyInputParsed>(() => (initial ? strip(initial) : EMPTY));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string; list?: string[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved ? strip(saved) : EMPTY), [form, saved]);
  useUnsavedGuard(dirty && canEdit);
  const problems = publishProblems(form);
  const isNew = !saved;
  const status = saved?.status ?? 'draft';

  const set = <K extends keyof PropertyInputParsed>(k: K, v: PropertyInputParsed[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLoc = (k: keyof PropertyInputParsed['location'], v: string) =>
    setForm((f) => ({ ...f, location: { ...f.location, [k]: k === 'lat' || k === 'lng' ? (v === '' ? null : (Number(v) as never)) : v } }));
  const err = (path: string) => errors[path];

  function validateLocally() {
    const r = propertyInputSchema.safeParse(form);
    if (r.success) {
      setErrors({});
      return r.data;
    }
    setErrors(Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message])));
    setNotice({ tone: 'error', text: 'Some fields need attention. They’re highlighted below.' });
    return null;
  }

  function handleError(e: unknown) {
    if (e instanceof AdminRequestError) {
      setErrors(Object.fromEntries(e.fields.map((f) => [f.path, f.message])));
      setNotice({ tone: 'error', text: e.message, list: e.problems.length ? e.problems : undefined });
    } else setNotice({ tone: 'error', text: 'That didn’t save. Check your connection and try again.' });
  }

  async function save() {
    const data = validateLocally();
    if (!data) return null;
    setBusy('save');
    setNotice(null);
    try {
      const res = isNew
        ? await adminRequest<EditablePropertyDto>('admin/properties', { method: 'POST', body: data })
        : await adminRequest<EditablePropertyDto>(`admin/properties/${saved!.id}`, { method: 'PUT', body: data });
      setSaved(res);
      setForm(strip(res));
      setNotice({ tone: 'success', text: isNew ? 'Draft created. Visitors can’t see it until you publish.' : status === 'published' ? 'Changes are live.' : 'Draft saved.' });
      if (isNew) router.replace(`/admin/properties/${res.id}`);
      router.refresh();
      return res;
    } catch (e) {
      handleError(e);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(next: PropertyStatus) {
    if (!saved) return;
    if (next === 'archived' && !window.confirm('Archive this listing? It will disappear from the website but stay in your records.')) return;
    if (next === 'draft' && !window.confirm('Unpublish this listing? It will disappear from the website until you publish it again.')) return;
    let current = saved;
    if (dirty) {
      const r = await save();
      if (!r) return;
      current = r;
    }
    setBusy(next);
    setNotice(null);
    try {
      const res = await adminRequest<EditablePropertyDto>(`admin/properties/${current.id}/status`, { method: 'POST', body: { status: next } });
      setSaved(res);
      setForm(strip(res));
      setNotice({ tone: 'success', text: next === 'published' ? 'Published. It’s now on your website.' : `${STATUS_ACTIONS[next]}: done.` });
      router.refresh();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!saved || !window.confirm('Delete this draft permanently? This can’t be undone.')) return;
    setBusy('delete');
    try {
      await adminRequest(`admin/properties/${saved.id}`, { method: 'DELETE' });
      router.replace('/admin/properties');
      router.refresh();
    } catch (e) {
      handleError(e);
      setBusy(null);
    }
  }

  const imageItems = form.images.map((img, i) => ({ ...img, id: `${img.url}#${i}` }));
  const readOnly = !canEdit;

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <legend className="sr-only">Listing details</legend>
        {notice && (
          <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
            {notice.list && <ul className="mt-1 list-disc pl-5">{notice.list.map((p) => <li key={p}>{p}</li>)}</ul>}
          </Notice>
        )}

        <FormSection title="Basics">
          <TextField label="Title" value={form.title} onChange={(v) => set('title', v)} error={err('title')} maxLength={140} hint="Shown on cards and as the page heading, e.g. “Sea Breeze Apartment, Bandstand”." />
          <div className="grid gap-5 sm:grid-cols-3">
            <SelectField label="Listing" value={form.listingType} onChange={(v) => set('listingType', v)} options={LISTING_TYPES.map((l) => ({ value: l, label: l === 'sale' ? 'For sale' : 'For rent' }))} />
            <SelectField label="Category" value={form.category} onChange={(v) => set('category', v)} options={PROPERTY_CATEGORIES.map((c) => ({ value: c, label: c === 'residential' ? 'Residential' : 'Commercial' }))} />
            <SelectField label="Property type" value={form.type} onChange={(v) => set('type', v)} options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))} />
          </div>
          <div className="grid gap-5 sm:grid-cols-4">
            <TextField
              label={form.listingType === 'rent' ? 'Rent per month (₹)' : 'Price (₹)'} type="number" inputMode="numeric" value={form.price || ''}
              onChange={(v) => set('price', Number(v) || 0)} error={err('price')} hint={form.price > 0 ? formatPrice(form.price, form.listingType === 'rent' ? 'month' : 'total') : undefined}
              className="sm:col-span-2"
            />
            <TextField label="Bedrooms (BHK)" type="number" inputMode="numeric" value={form.bhk ?? ''} onChange={(v) => set('bhk', v === '' ? null : Number(v))} error={err('bhk')} optional />
            <TextField label="Bathrooms" type="number" inputMode="numeric" value={form.bathrooms ?? ''} onChange={(v) => set('bathrooms', v === '' ? null : Number(v))} error={err('bathrooms')} optional />
          </div>
          <TextField label="Built-up area (sq ft)" type="number" inputMode="numeric" value={form.areaSqft || ''} onChange={(v) => set('areaSqft', Number(v) || 0)} error={err('areaSqft')} className="sm:max-w-xs" />
        </FormSection>

        <FormSection title="Location" description="Visitors see the locality and city. The map pin shows the area, not the exact address.">
          <div className="grid gap-5 sm:grid-cols-3">
            <TextField label="Locality" value={form.location.locality} onChange={(v) => setLoc('locality', v)} error={err('location.locality')} />
            <TextField label="City" value={form.location.city} onChange={(v) => setLoc('city', v)} error={err('location.city')} />
            <TextField label="State" value={form.location.state} onChange={(v) => setLoc('state', v)} optional />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField label="Latitude" type="number" value={form.location.lat ?? ''} onChange={(v) => setLoc('lat', v)} error={err('location.lat')} optional hint="Right-click the spot in Google Maps to copy coordinates." />
            <TextField label="Longitude" type="number" value={form.location.lng ?? ''} onChange={(v) => setLoc('lng', v)} error={err('location.lng')} optional />
          </div>
        </FormSection>

        <FormSection title="Photos" description="The first photo is the cover. Drag to reorder. Add descriptions for people using screen readers.">
          {err('images') && <Notice tone="error">{err('images')}</Notice>}
          {form.images.length === 0 ? (
            <button type="button" onClick={() => setPicker(true)} className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line py-10 text-muted hover:border-ink/40 hover:text-ink">
              <ImagePlus className="size-6" aria-hidden="true" />
              <span className="font-medium">Add photos</span>
              <span className="text-sm">Upload new ones or choose from your library</span>
            </button>
          ) : (
            <>
              <SortableList
                layout="grid"
                label="Listing photos"
                items={imageItems}
                onReorder={(next) => set('images', next.map(({ url, alt }) => ({ url, alt })))}
                render={(img, handle, i) => (
                  <div className="rounded-xl border border-line bg-white p-2">
                    <div className="media-fallback relative aspect-[4/3] overflow-hidden rounded-lg">
                      <Image src={img.url} alt={img.alt} fill sizes="240px" className="object-cover" />
                      {i === 0 && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-primary"><Star className="size-3" aria-hidden="true" />Cover</span>}
                      <button type="button" onClick={() => set('images', form.images.filter((_, j) => j !== i))} className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-white/90 text-ink hover:bg-white" aria-label={`Remove photo ${i + 1}`}>
                        <X className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      {handle}
                      <label className="sr-only" htmlFor={`alt-${i}`}>Description of photo {i + 1}</label>
                      <input id={`alt-${i}`} value={img.alt} maxLength={200} placeholder="Describe this photo" onChange={(e) => set('images', form.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} className="h-8 min-w-0 flex-1 rounded-md border border-line px-2 text-sm" />
                    </div>
                  </div>
                )}
              />
              <button type="button" onClick={() => setPicker(true)} className="btn btn-ghost min-h-10"><ImagePlus className="size-4" aria-hidden="true" />Add more photos</button>
            </>
          )}
          <MediaPickerDialog open={picker} onOpenChange={setPicker} multiple title="Add photos" onSelect={(items) => set('images', [...form.images, ...items.map((m) => ({ url: m.url, alt: m.alt }))].slice(0, 30))} />
        </FormSection>

        <FormSection title="Description">
          <TextArea label="Summary" value={form.summary} onChange={(v) => set('summary', v)} rows={2} maxLength={240} error={err('summary')} hint="One or two sentences for cards and search results." />
          <TextArea label="Full description" value={form.description} onChange={(v) => set('description', v)} rows={8} maxLength={8000} error={err('description')} hint="Leave a blank line between paragraphs." />
          <TagsField label="Amenities" value={form.amenities} onChange={(v) => set('amenities', v)} suggestions={AMENITY_SUGGESTIONS} error={err('amenities')} />
        </FormSection>

        <FormSection title="Assignment & visibility">
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField label="Advisor" value={form.agentId ?? ''} onChange={(v) => set('agentId', v || null)} options={[{ value: '', label: 'Unassigned' }, ...agents.map((a) => ({ value: a.id, label: a.name }))]} hint="Enquiries on this listing go to this advisor." error={err('agentId')} />
            <SelectField label="Project" value={form.projectId ?? ''} onChange={(v) => set('projectId', v || null)} options={[{ value: '', label: 'Not part of a project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} error={err('projectId')} />
          </div>
          <Toggle label="Featured" hint="Shown in the homepage’s featured section and listed first." checked={form.featured} onChange={(v) => set('featured', v)} />
          <Toggle label="Verified" hint="Show the verified badge once you’ve checked the documents and visited the home." checked={form.verified} onChange={(v) => set('verified', v)} />
        </FormSection>

        <FormSection title="Web address">
          <TextField
            label="URL" value={form.slug} onChange={(v) => set('slug', v.toLowerCase())} error={err('slug')}
            placeholder={slugify(`${form.title} ${form.location.locality}`) || 'created from the title'}
            hint={`/properties/${form.slug || slugify(`${form.title} ${form.location.locality}`) || '…'}${saved?.previousSlugs.length ? ` · old addresses redirect here: ${saved.previousSlugs.join(', ')}` : ''}`}
          />
        </FormSection>
      </fieldset>

      <aside className="xl:sticky xl:top-24 xl:self-start">
        <div className="space-y-4 rounded-[14px] border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <p className="font-heading font-semibold">Status</p>
            <PropertyStatusBadge status={status} />
          </div>
          {canEdit && (
            <>
              <button type="button" onClick={save} disabled={!!busy || (!dirty && !isNew)} className="btn btn-primary w-full disabled:opacity-50">
                {busy === 'save' ? 'Saving…' : isNew ? 'Create draft' : status === 'published' ? (dirty ? 'Save and update live page' : 'All changes saved') : dirty ? 'Save draft' : 'All changes saved'}
              </button>
              {saved && saved.allowedTransitions.length > 0 && (
                <div className="space-y-2 border-t border-line pt-4">
                  {saved.allowedTransitions.filter((t) => !(t === 'sold' && form.listingType === 'rent') && !(t === 'rented' && form.listingType === 'sale')).map((t) => (
                    <button
                      key={t} type="button" onClick={() => changeStatus(t)} disabled={!!busy || (t === 'published' && problems.length > 0)}
                      className={cn('btn w-full min-h-10 disabled:opacity-50', t === 'published' ? 'btn-accent' : 'btn-ghost', t === 'archived' && 'text-muted')}
                    >
                      {t === 'archived' && <Archive className="size-4" aria-hidden="true" />}
                      {busy === t ? 'Working…' : STATUS_ACTIONS[t]}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="border-t border-line pt-4">
            <p className="text-sm font-medium">Ready to publish?</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {['Add at least one photo', 'Write a summary of at least 20 characters', 'Write a description of at least 80 characters', 'Set a price', 'Add the locality and city'].map((rule) => {
                const ok = !problems.includes(rule);
                return (
                  <li key={rule} className={cn('flex items-start gap-2', ok ? 'text-muted' : 'text-ink')}>
                    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden="true" />}
                    <span>{rule}<span className="sr-only">{ok ? ' (done)' : ' (to do)'}</span></span>
                  </li>
                );
              })}
            </ul>
          </div>

          {saved && (
            <div className="space-y-2 border-t border-line pt-4 text-sm">
              <Link href={`/admin/preview/property/${saved.id}`} target="_blank" className="flex items-center gap-2 font-medium hover:underline"><Eye className="size-4" aria-hidden="true" />Preview listing page</Link>
              {['published', 'sold', 'rented'].includes(status) && (
                <a href={`/properties/${saved.slug}`} target="_blank" rel="noopener" className="flex items-center gap-2 font-medium hover:underline"><ExternalLink className="size-4" aria-hidden="true" />View live page</a>
              )}
              <p className="text-muted">Last saved {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(saved.updatedAt))}</p>
              {dirty && <p className="font-medium text-[color-mix(in_oklab,var(--color-accent)_50%,black)]">You have unsaved changes</p>}
            </div>
          )}

          {canEdit && saved && status === 'draft' && !saved.publishedAt && (
            <button type="button" onClick={remove} disabled={!!busy} className="flex items-center gap-2 border-t border-line pt-4 text-sm text-[var(--color-error)] hover:underline">
              <Trash2 className="size-4" aria-hidden="true" />{busy === 'delete' ? 'Deleting…' : 'Delete draft'}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function strip(d: EditablePropertyDto | PropertyInputParsed): PropertyInputParsed {
  return {
    title: d.title, slug: d.slug, summary: d.summary, description: d.description, listingType: d.listingType, category: d.category, type: d.type,
    price: d.price, bhk: d.bhk, bathrooms: d.bathrooms, areaSqft: d.areaSqft, location: { ...d.location }, amenities: [...d.amenities],
    images: d.images.map((i) => ({ url: i.url, alt: i.alt })), featured: d.featured, verified: d.verified, agentId: d.agentId, projectId: d.projectId,
  };
}
