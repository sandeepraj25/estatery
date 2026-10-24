'use client';

import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { PAGE_KEYS, PAGE_LABELS, PAGE_PATHS, type PageKey, type SitePages } from '@estatery/shared';
import { AdminRequestError } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice, useUnsavedGuard } from '../fields';
import { fieldErrors, saveDraft } from './draft-api';
import type { FieldSpec } from './section-specs';
import { SpecForm } from './spec-form';

const base: FieldSpec[] = [
  { k: 'enabled', label: 'Show this page on the website', kind: 'toggle', hint: 'When off, its address shows “page not found” and it leaves the sitemap.' },
  { k: 'title', label: 'Page title', kind: 'text', max: 80 },
  { k: 'intro', label: 'Introduction', kind: 'textarea', max: 400, optional: true },
];
const seo: FieldSpec = { k: 'seoDescription', label: 'Description in search results', kind: 'textarea', max: 170, optional: true, hint: 'About 150 characters. Leave blank to use the introduction.' };

const SPECS: Record<PageKey, { description: string; fields: FieldSpec[] }> = {
  about: {
    description: 'Your story, how you work and the people behind the agency.',
    fields: [
      ...base,
      { k: 'image', label: 'Wide photo', kind: 'image', hint: 'Shown under the title. Your office, team or a signature home.' },
      { k: 'highlights', label: 'Key facts', kind: 'list', min: 0, max: 4, itemLabel: 'fact', titleKey: 'value', blank: { value: '', label: '' }, item: [
        { k: 'value', label: 'Figure', kind: 'text', max: 20, hint: 'e.g. 18 yrs' }, { k: 'label', label: 'What it means', kind: 'text', max: 60 },
      ] },
      { k: 'body', label: 'Story', kind: 'richtext', max: 20_000 },
      { k: 'showAdvisors', label: 'Show your advisors', kind: 'toggle', hint: 'From the Content library.' },
      { k: 'showTestimonials', label: 'Show client stories', kind: 'toggle' },
      seo,
    ],
  },
  contact: {
    description: 'Phone, WhatsApp, email and address come from Business details.',
    fields: [
      ...base,
      { k: 'showForm', label: 'Show the enquiry form', kind: 'toggle', hint: 'Enquiries go straight to Leads.' },
      { k: 'mapUrl', label: 'Google Maps link', kind: 'text', max: 500, optional: true, hint: 'Share → Copy link in Google Maps. Leave blank to search for your address.' },
      { k: 'body', label: 'Notes for visitors', kind: 'richtext', max: 4_000, rows: 5 },
      seo,
    ],
  },
  faq: {
    description: 'Answers appear as expandable questions, and search engines can show them in results.',
    fields: [
      ...base,
      { k: 'items', label: 'Questions', kind: 'list', min: 0, max: 40, itemLabel: 'question', titleKey: 'question', blank: { question: '', answer: '' }, item: [
        { k: 'question', label: 'Question', kind: 'text', max: 200 }, { k: 'answer', label: 'Answer', kind: 'richtext', max: 2_000, rows: 4 },
      ] },
      seo,
    ],
  },
  privacy: {
    description: 'Starts from a general template for Indian agencies under the DPDP Act, 2023. Have it reviewed by your legal adviser.',
    fields: [...base, { k: 'lastUpdated', label: 'Last updated', kind: 'date' }, { k: 'body', label: 'Policy', kind: 'richtext', max: 40_000, rows: 22 }, seo],
  },
  terms: {
    description: 'Starts from a general template. Have it reviewed by your legal adviser.',
    fields: [...base, { k: 'lastUpdated', label: 'Last updated', kind: 'date' }, { k: 'body', label: 'Terms', kind: 'richtext', max: 40_000, rows: 22 }, seo],
  },
};

export function PagesEditor({ initial, revision, defaults, canEdit, onSaved, onSelect }: {
  initial: SitePages; revision: number; defaults: SitePages; canEdit: boolean; onSaved: (r: number) => void; onSelect: (path: string) => void;
}) {
  const [pages, setPages] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [rev, setRev] = useState(revision);
  const [key, setKey] = useState<PageKey>('about');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(pages) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty);
  const pageDirty = (k: PageKey) => JSON.stringify(pages[k]) !== JSON.stringify(baseline[k]);

  function select(k: PageKey) {
    setKey(k);
    onSelect(PAGE_PATHS[k]);
  }

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const r = await saveDraft('pages', pages, rev);
      setRev(r.revision);
      setBaseline(pages);
      setErrors({});
      onSaved(r.revision);
      setNotice({ tone: 'success', text: 'Pages saved to the draft. Publish to put them live.' });
    } catch (e) {
      if (e instanceof AdminRequestError) {
        setErrors(fieldErrors(e.fields));
        const first = e.fields[0];
        const onPage = first ? (first.path.split('.')[0] as PageKey) : null;
        if (onPage && PAGE_KEYS.includes(onPage)) select(onPage);
        setNotice({ tone: 'error', text: e.fields.length ? `${e.message} ${e.fields.slice(0, 3).map((f) => f.message).join('; ')}` : e.message });
      } else setNotice({ tone: 'error', text: 'Your changes didn’t save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  // Errors come back as "about.title"; the form for one page expects "title".
  const pageErrors = Object.fromEntries(Object.entries(errors).filter(([p]) => p.startsWith(`${key}.`)).map(([p, m]) => [p.slice(key.length + 1), m]));
  const spec = SPECS[key];

  return (
    <fieldset disabled={!canEdit} className="space-y-6">
      <legend className="sr-only">Pages</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{canEdit ? 'About, Contact, FAQ and your legal pages.' : 'Your role can’t edit pages.'}</p>
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn btn-primary min-h-10 disabled:opacity-50">{saving ? 'Saving…' : dirty ? 'Save draft' : 'Draft saved'}</button>
      </div>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <nav aria-label="Pages">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {PAGE_KEYS.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => select(k)} aria-current={key === k ? 'page' : undefined} className={cn('flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm', key === k ? 'bg-primary text-inverse' : 'hover:bg-white')}>
                  <span>{PAGE_LABELS[k]}{pageDirty(k) && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle" aria-label="(unsaved)" />}</span>
                  {!pages[k].enabled && <span className={cn('text-xs', key === k ? 'text-white/70' : 'text-muted')}>Off</span>}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section className="min-w-0 rounded-[14px] border border-line bg-white">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
            <div>
              <h3 className="font-heading font-semibold">{PAGE_LABELS[key]} <span className="font-normal text-muted">· {PAGE_PATHS[key]}</span></h3>
              <p className="text-sm text-muted">{spec.description}</p>
            </div>
            <button type="button" onClick={() => { if (window.confirm(`Replace the ${PAGE_LABELS[key]} page with the starting template? Save the draft to keep it.`)) setPages((p) => ({ ...p, [key]: defaults[key] })); }} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
              <RotateCcw className="size-4" aria-hidden="true" />Use template
            </button>
          </div>
          <div className="p-5">
            <SpecForm key={key} fields={spec.fields} value={pages[key] as unknown as Record<string, unknown>} onChange={(next) => setPages((p) => ({ ...p, [key]: next }))} errors={pageErrors} />
          </div>
        </section>
      </div>
    </fieldset>
  );
}
