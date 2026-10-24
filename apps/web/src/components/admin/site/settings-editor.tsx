'use client';

import { useState } from 'react';
import type { SiteSettings } from '@estatery/shared';
import { AdminRequestError } from '@/lib/admin-client';
import { Notice, useUnsavedGuard } from '../fields';
import { fieldErrors, saveDraft } from './draft-api';
import type { FieldSpec } from './section-specs';
import { SpecForm } from './spec-form';

const LINK_HINT = 'A page on your site (e.g. /properties?listingType=rent) or a full https:// address.';

const GROUPS: Array<{ title: string; description?: string; fields: FieldSpec[] }> = [
  {
    title: 'Brand',
    fields: [
      { k: 'businessName', label: 'Business name', kind: 'text', max: 80, hint: 'Used in page titles, the footer and emails.' },
      { k: 'tagline', label: 'Tagline', kind: 'text', max: 120 },
      { k: 'logoText', label: 'Text logo', kind: 'text', max: 40, hint: 'Shown when no logo image is set.' },
      { k: 'logoUrl', label: 'Logo image', kind: 'image', hint: 'Optional. A wide PNG or WebP with a transparent background works best.' },
      { k: 'showPlatformBranding', label: 'Show “Powered by Estatery” in the footer', kind: 'toggle', hint: 'Hiding it needs the Professional or Signature plan. On other plans the line stays, whatever this is set to.' },
    ],
  },
  {
    title: 'Contact details',
    description: 'Shown in the header menu, footer and on every listing.',
    fields: [{ k: 'contact', label: 'Contact', kind: 'group', fields: [
      { k: 'phone', label: 'Phone', kind: 'text', max: 30 },
      { k: 'whatsapp', label: 'WhatsApp number', kind: 'text', max: 30, hint: 'With country code, e.g. +91 98200 00000.' },
      { k: 'email', label: 'Email', kind: 'text', max: 120 },
      { k: 'address', label: 'Office address', kind: 'textarea', max: 200 },
      { k: 'hours', label: 'Opening hours', kind: 'text', max: 80 },
    ] }],
  },
  {
    title: 'Navigation',
    fields: [
      { k: 'navigation', label: 'Header links', kind: 'list', min: 1, max: 8, itemLabel: 'link', titleKey: 'label', blank: { label: 'About', href: '/#about' }, item: [
        { k: 'label', label: 'Label', kind: 'text', max: 30 }, { k: 'href', label: 'Link', kind: 'href', hint: LINK_HINT },
      ] },
      { k: 'footerColumns', label: 'Footer columns', kind: 'list', min: 0, max: 4, itemLabel: 'column', titleKey: 'title', blank: { title: 'Explore', links: [] }, item: [
        { k: 'title', label: 'Column heading', kind: 'text', max: 30 },
        { k: 'links', label: 'Links', kind: 'list', min: 0, max: 8, itemLabel: 'link', titleKey: 'label', blank: { label: 'Homes for sale', href: '/properties?listingType=sale' }, item: [
          { k: 'label', label: 'Label', kind: 'text', max: 40 }, { k: 'href', label: 'Link', kind: 'href', hint: LINK_HINT },
        ] },
      ] },
      { k: 'social', label: 'Social profiles', kind: 'list', min: 0, max: 6, itemLabel: 'profile', titleKey: 'network', blank: { network: 'instagram', href: 'https://instagram.com/' }, item: [
        { k: 'network', label: 'Network', kind: 'select', options: [{ value: 'instagram', label: 'Instagram' }, { value: 'linkedin', label: 'LinkedIn' }, { value: 'youtube', label: 'YouTube' }, { value: 'facebook', label: 'Facebook' }, { value: 'x', label: 'X' }] },
        { k: 'href', label: 'Profile address', kind: 'href' },
      ] },
    ],
  },
  {
    title: 'Search engines & sharing',
    description: 'How your homepage appears in Google results and when the link is shared.',
    fields: [{ k: 'seo', label: 'SEO', kind: 'group', fields: [
      { k: 'title', label: 'Page title', kind: 'text', max: 70, hint: 'About 50–60 characters, e.g. “Aurelia Estates — Luxury Homes in Mumbai & Goa”.' },
      { k: 'description', label: 'Description', kind: 'textarea', max: 170, hint: 'About 150 characters describing what you offer and where.' },
      { k: 'ogImage', label: 'Sharing image', kind: 'image', hint: '1200×630 works best for WhatsApp, LinkedIn and X previews.' },
    ] }],
  },
  {
    title: 'Region',
    fields: [
      { k: 'locale', label: 'Language and number format', kind: 'select', options: [{ value: 'en-IN', label: 'English (India) — ₹1,00,000' }, { value: 'en-GB', label: 'English (UK)' }, { value: 'en-US', label: 'English (US)' }] },
      { k: 'currency', label: 'Currency', kind: 'select', options: [{ value: 'INR', label: 'Indian rupee (₹)' }, { value: 'AED', label: 'UAE dirham' }, { value: 'USD', label: 'US dollar' }, { value: 'GBP', label: 'British pound' }] },
      { k: 'timezone', label: 'Time zone', kind: 'select', options: [{ value: 'Asia/Kolkata', label: 'India (IST)' }, { value: 'Asia/Dubai', label: 'Dubai (GST)' }, { value: 'Europe/London', label: 'London' }, { value: 'America/New_York', label: 'New York' }] },
    ],
  },
];

/** Empty image fields mean "no image" (null) in the settings schema. */
const normalise = (s: SiteSettings): SiteSettings => ({ ...s, logoUrl: s.logoUrl || null, seo: { ...s.seo, ogImage: s.seo.ogImage || null } });

export function SettingsEditor({ initial, revision, canEdit, onSaved }: { initial: SiteSettings; revision: number; canEdit: boolean; onSaved: (r: number) => void }) {
  const [s, setS] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [rev, setRev] = useState(revision);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(normalise(s)) !== JSON.stringify(normalise(baseline));
  useUnsavedGuard(dirty);

  async function save() {
    setSaving(true);
    setNotice(null);
    try {
      const value = normalise(s);
      const r = await saveDraft('settings', value, rev);
      setRev(r.revision);
      setBaseline(value);
      setS(value);
      setErrors({});
      onSaved(r.revision);
      setNotice({ tone: 'success', text: 'Business details saved to the draft.' });
    } catch (e) {
      if (e instanceof AdminRequestError) {
        setErrors(fieldErrors(e.fields));
        setNotice({ tone: 'error', text: e.fields.length ? `${e.message} ${e.fields.slice(0, 3).map((f) => `${f.path}: ${f.message}`).join('; ')}` : e.message });
      } else setNotice({ tone: 'error', text: 'Your changes didn’t save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={!canEdit} className="space-y-6">
      <legend className="sr-only">Business details</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{canEdit ? 'Your name, contact details, menus and search appearance.' : 'Only owners and administrators can change business details.'}</p>
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn btn-primary min-h-10 disabled:opacity-50">{saving ? 'Saving…' : dirty ? 'Save draft' : 'Draft saved'}</button>
      </div>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}
      {GROUPS.map((g) => (
        <section key={g.title} className="rounded-[14px] border border-line bg-white">
          <div className="border-b border-line px-5 py-4">
            <h3 className="font-heading font-semibold">{g.title}</h3>
            {g.description && <p className="text-sm text-muted">{g.description}</p>}
          </div>
          <div className="p-5">
            <SpecForm fields={g.fields} value={s as unknown as Record<string, unknown>} onChange={(next) => setS(next as unknown as SiteSettings)} errors={errors} />
          </div>
        </section>
      ))}
    </fieldset>
  );
}
