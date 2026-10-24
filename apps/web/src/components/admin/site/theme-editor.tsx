'use client';

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { BODY_FONTS, HEADING_FONTS, type ThemeTokens } from '@estatery/shared';
import { AdminRequestError } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice, SelectField, Toggle, useUnsavedGuard } from '../fields';
import { fieldErrors, saveDraft } from './draft-api';

/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrast(a: string, b: string) {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

const COLOR_FIELDS: Array<{ k: keyof ThemeTokens['colors']; label: string; hint: string }> = [
  { k: 'primary', label: 'Brand colour', hint: 'Hero, dark sections, footer and main buttons' },
  { k: 'background', label: 'Page background', hint: 'Light sections' },
  { k: 'accent', label: 'Accent', hint: 'Highlights and one key button — use sparingly' },
  { k: 'textOnLight', label: 'Text on light', hint: 'Body text and headings' },
  { k: 'textOnDark', label: 'Text on dark', hint: 'Text on the brand colour' },
  { k: 'mutedOnLight', label: 'Secondary text on light', hint: 'Descriptions and captions' },
  { k: 'mutedOnDark', label: 'Secondary text on dark', hint: 'Captions on dark sections' },
  { k: 'border', label: 'Lines and borders', hint: 'Card and form outlines' },
];

const FONT_LABELS: Record<string, string> = { manrope: 'Manrope (modern sans)', inter: 'Inter (neutral sans)', playfair: 'Playfair Display (editorial serif)' };

export function ThemeEditor({ initial, revision, presets, canEdit, onSaved }: {
  initial: ThemeTokens; revision: number; presets: Array<{ id: string; label: string; tokens: ThemeTokens; isDefault: boolean }>; canEdit: boolean; onSaved: (r: number) => void;
}) {
  const [t, setT] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [rev, setRev] = useState(revision);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(t) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty);

  const c = t.colors;
  const checks = [
    { label: 'Body text on the page background', ratio: contrast(c.textOnLight, c.background), min: 4.5 },
    { label: 'Secondary text on the page background', ratio: contrast(c.mutedOnLight, c.background), min: 4.5 },
    { label: 'Text on the brand colour', ratio: contrast(c.textOnDark, c.primary), min: 4.5 },
    { label: 'Secondary text on the brand colour', ratio: contrast(c.mutedOnDark, c.primary), min: 4.5 },
    { label: 'Brand colour buttons on the page background', ratio: contrast(c.primary, c.background), min: 3 },
    { label: 'Accent buttons (brand-coloured text on accent)', ratio: contrast(c.primary, c.accent), min: 4.5 },
  ];
  const failing = checks.filter((x) => x.ratio < x.min).length;

  const setColor = (k: keyof ThemeTokens['colors'], v: string) => setT((p) => ({ ...p, colors: { ...p.colors, [k]: v.toUpperCase() } }));

  async function save() {
    if (failing && !window.confirm(`${failing} colour ${failing === 1 ? 'pair doesn’t' : 'pairs don’t'} meet accessibility contrast guidelines, so some text will be hard to read. Save anyway?`)) return;
    setSaving(true);
    setNotice(null);
    try {
      const r = await saveDraft('theme', t, rev);
      setRev(r.revision);
      setBaseline(t);
      onSaved(r.revision);
      setErrors({});
      setNotice({ tone: 'success', text: 'Theme draft saved. It goes live when you publish.' });
    } catch (e) {
      if (e instanceof AdminRequestError) {
        setErrors(fieldErrors(e.fields));
        setNotice({ tone: 'error', text: e.message });
      } else setNotice({ tone: 'error', text: 'The theme didn’t save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <fieldset disabled={!canEdit} className="space-y-6">
      <legend className="sr-only">Theme</legend>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{canEdit ? 'Colours, type and shape for your whole site.' : 'Only owners and administrators can change the theme.'}</p>
        <button type="button" onClick={save} disabled={!dirty || saving} className="btn btn-primary min-h-10 disabled:opacity-50">{saving ? 'Saving…' : dirty ? 'Save theme draft' : 'Theme saved'}</button>
      </div>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <section className="rounded-[14px] border border-line bg-white p-5">
        <h3 className="font-heading font-semibold">Start from a preset</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {presets.map((p) => (
            <button key={p.id} type="button" onClick={() => setT(p.tokens)} className="flex items-center gap-3 rounded-xl border border-line p-3 text-left hover:border-ink/40">
              <span className="flex overflow-hidden rounded-md">
                {[p.tokens.colors.primary, p.tokens.colors.background, p.tokens.colors.accent].map((col) => <span key={col} className="block size-7" style={{ background: col }} />)}
              </span>
              <span><span className="block text-sm font-semibold">{p.label}</span>{p.isDefault && <span className="text-xs text-muted">Platform default</span>}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <section className="rounded-[14px] border border-line bg-white p-5">
          <h3 className="font-heading font-semibold">Colours</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <div key={f.k}>
                <label htmlFor={`color-${f.k}`} className="text-sm font-medium">{f.label}</label>
                <p className="text-xs text-muted">{f.hint}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <input type="color" value={c[f.k]} onChange={(e) => setColor(f.k, e.target.value)} className="size-11 shrink-0 cursor-pointer rounded-lg border border-line bg-white p-1" aria-label={`${f.label} colour picker`} />
                  <input
                    id={`color-${f.k}`} value={c[f.k]} maxLength={7} onChange={(e) => setColor(f.k, e.target.value)}
                    className="field h-11 min-h-11 font-mono text-sm uppercase" aria-invalid={!/^#[0-9a-f]{6}$/i.test(c[f.k]) || !!errors[`colors.${f.k}`]}
                  />
                </div>
                {!/^#[0-9a-f]{6}$/i.test(c[f.k]) && <p className="mt-1 text-xs text-[var(--color-error)]">Use a 6-digit hex colour like #10251D</p>}
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-[14px] border border-line" aria-label="Theme sample">
            <div className="p-6" style={{ background: c.primary, color: c.textOnDark }}>
              <p style={{ color: c.mutedOnDark }} className="text-sm">Sample · dark section</p>
              <p className="mt-2 text-3xl" style={{ fontFamily: t.typography.editorialHeadlines ? "'Playfair Display Variable', serif" : t.typography.heading === 'playfair' ? "'Playfair Display Variable', serif" : "'Manrope Variable', sans-serif", fontWeight: t.typography.editorialHeadlines ? 500 : 700 }}>
                A place beyond ordinary
              </p>
              <span className="mt-4 inline-block px-4 py-2 text-sm font-semibold" style={{ background: c.accent, color: c.primary, borderRadius: t.shape.radiusButton }}>Explore properties</span>
            </div>
            <div className="p-6" style={{ background: c.background, color: c.textOnLight }}>
              <div className="border bg-white p-4" style={{ borderColor: c.border, borderRadius: t.shape.radiusCard }}>
                <p className="font-semibold" style={{ fontFamily: t.typography.heading === 'playfair' ? "'Playfair Display Variable', serif" : "'Manrope Variable', sans-serif" }}>Sea Breeze Apartment</p>
                <p className="text-sm" style={{ color: c.mutedOnLight }}>Bandra West, Mumbai</p>
                <span className="mt-3 inline-block px-4 py-2 text-sm font-semibold" style={{ background: c.primary, color: c.textOnDark, borderRadius: t.shape.radiusButton }}>View details</span>
              </div>
            </div>
          </section>

          <section className="rounded-[14px] border border-line bg-white p-5">
            <h3 className="font-heading font-semibold">Readability</h3>
            <p className="mt-1 text-sm text-muted">Contrast against WCAG AA. Low contrast makes text hard to read for many visitors.</p>
            <ul className="mt-3 space-y-2 text-sm">
              {checks.map((x) => {
                const ok = x.ratio >= x.min;
                return (
                  <li key={x.label} className="flex items-start gap-2">
                    {ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-error)]" aria-hidden="true" />}
                    <span className={cn('flex-1', !ok && 'font-medium')}>{x.label}</span>
                    <span className={cn('font-mono text-xs', ok ? 'text-muted' : 'text-[var(--color-error)]')}>{x.ratio.toFixed(1)}:1{ok ? '' : ` (needs ${x.min})`}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>

      <section className="grid gap-5 rounded-[14px] border border-line bg-white p-5 lg:grid-cols-2">
        <h3 className="font-heading font-semibold lg:col-span-2">Typography, shape and motion</h3>
        <SelectField label="Heading font" value={t.typography.heading} onChange={(v) => setT((p) => ({ ...p, typography: { ...p.typography, heading: v } }))} options={HEADING_FONTS.map((f) => ({ value: f, label: FONT_LABELS[f]! }))} />
        <SelectField label="Body font" value={t.typography.body} onChange={(v) => setT((p) => ({ ...p, typography: { ...p.typography, body: v } }))} options={BODY_FONTS.map((f) => ({ value: f, label: FONT_LABELS[f]! }))} />
        <div className="lg:col-span-2">
          <Toggle label="Editorial headlines" hint="Set large display headlines in Playfair Display, the serif used for luxury editorial pages." checked={t.typography.editorialHeadlines} onChange={(v) => setT((p) => ({ ...p, typography: { ...p.typography, editorialHeadlines: v } }))} />
        </div>
        {([['radiusCard', 'Card corners', 32], ['radiusButton', 'Button corners', 999]] as const).map(([k, label, max]) => (
          <div key={k}>
            <label htmlFor={`r-${k}`} className="text-sm font-medium">{label}: {t.shape[k] >= 100 ? 'pill' : `${t.shape[k]}px`}</label>
            <input
              id={`r-${k}`} type="range" min={0} max={k === 'radiusButton' ? 32 : max} value={Math.min(t.shape[k], k === 'radiusButton' ? 32 : max)}
              onChange={(e) => setT((p) => ({ ...p, shape: { ...p.shape, [k]: Number(e.target.value) } }))} className="mt-2 w-full accent-[var(--color-primary)]"
            />
            {k === 'radiusButton' && (
              <label className="mt-1 flex items-center gap-2 text-sm"><input type="checkbox" checked={t.shape.radiusButton >= 100} onChange={(e) => setT((p) => ({ ...p, shape: { ...p.shape, radiusButton: e.target.checked ? 999 : 8 } }))} className="accent-[var(--color-primary)]" />Fully rounded (pill) buttons</label>
            )}
          </div>
        ))}
        <SelectField
          label="Motion" value={t.motion.level} onChange={(v) => setT((p) => ({ ...p, motion: { level: v } }))}
          options={[{ value: 'full', label: 'Full — cinematic entrances and 3D' }, { value: 'subtle', label: 'Subtle — gentler movement' }, { value: 'none', label: 'None — no decorative motion or 3D' }]}
          hint="Visitors who ask their device for reduced motion never see decorative animation."
        />
      </section>
    </fieldset>
  );
}
