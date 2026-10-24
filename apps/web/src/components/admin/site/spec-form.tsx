'use client';

import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { ImageField } from '../media-picker';
import { SelectField, TextArea, TextField, Toggle } from '../fields';
import type { FieldSpec } from './section-specs';
import { RichTextField } from '../rich-text-field';

type Obj = Record<string, unknown>;

/** Renders form controls for a FieldSpec list over a plain object, returning updated copies. */
export function SpecForm({ fields, value, onChange, errors, path = '' }: {
  fields: FieldSpec[]; value: Obj; onChange: (next: Obj) => void; errors: Record<string, string>; path?: string;
}) {
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  const errAt = (k: string) => errors[`${path}${k}`];

  return (
    <div className="space-y-5">
      {fields.map((f) => {
        const v = value[f.k];
        switch (f.kind) {
          case 'text':
          case 'href':
            return <TextField key={f.k} label={f.label} value={(v as string) ?? ''} onChange={(x) => set(f.k, x)} hint={f.hint} maxLength={f.max} optional={f.optional} error={errAt(f.k)} placeholder={f.kind === 'href' ? '/properties' : undefined} />;
          case 'textarea':
            return <TextArea key={f.k} label={f.label} value={(v as string) ?? ''} onChange={(x) => set(f.k, x)} hint={f.hint} maxLength={f.max} optional={f.optional} rows={3} error={errAt(f.k)} />;
          case 'number':
            return <TextField key={f.k} label={f.label} type="number" value={(v as number) ?? f.min} onChange={(x) => set(f.k, Math.min(f.max, Math.max(f.min, Number(x) || f.min)))} hint={f.hint ?? `Between ${f.min} and ${f.max}.`} error={errAt(f.k)} className="max-w-48" />;
          case 'richtext':
            return <RichTextField key={f.k} label={f.label} value={(v as string) ?? ''} onChange={(x) => set(f.k, x)} hint={f.hint} maxLength={f.max} rows={f.rows ?? 10} error={errAt(f.k)} />;
          case 'date':
            return <TextField key={f.k} label={f.label} type="date" value={(v as string) ?? ''} onChange={(x) => set(f.k, x)} hint={f.hint} error={errAt(f.k)} className="max-w-56" />;
          case 'toggle':
            return <Toggle key={f.k} label={f.label} hint={f.hint} checked={!!v} onChange={(x) => set(f.k, x)} />;
          case 'select':
            return <SelectField key={f.k} label={f.label} value={(v as string) ?? f.options[0]!.value} onChange={(x) => set(f.k, x)} options={f.options} hint={f.hint} />;
          case 'image':
            return (
              <div key={f.k}>
                <ImageField label={f.label} value={(v as string) || null} onChange={(url) => set(f.k, url ?? '')} hint={f.hint} />
                {errAt(f.k) && <p className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{errAt(f.k)}</p>}
              </div>
            );
          case 'cta': {
            const cta = (v as { label: string; href: string }) ?? { label: '', href: '' };
            return (
              <fieldset key={f.k} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-medium">{f.label}</legend>
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField label="Button text" value={cta.label} onChange={(x) => set(f.k, { ...cta, label: x })} maxLength={40} error={errAt(`${f.k}.label`)} />
                  <TextField label="Link" value={cta.href} onChange={(x) => set(f.k, { ...cta, href: x })} error={errAt(`${f.k}.href`)} placeholder="/properties" />
                </div>
              </fieldset>
            );
          }
          case 'group':
            return (
              <fieldset key={f.k} className="rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-medium">{f.label}</legend>
                <SpecForm fields={f.fields} value={(v as Obj) ?? {}} onChange={(x) => set(f.k, x)} errors={errors} path={`${path}${f.k}.`} />
              </fieldset>
            );
          case 'list': {
            const items = ((v as Obj[]) ?? []) as Obj[];
            const move = (i: number, d: number) => {
              const next = [...items];
              const [it] = next.splice(i, 1);
              next.splice(i + d, 0, it!);
              set(f.k, next);
            };
            return (
              <fieldset key={f.k}>
                <legend className="mb-2 text-sm font-medium">{f.label} <span className="font-normal text-muted">({items.length}/{f.max})</span></legend>
                {errAt(f.k) && <p className="mb-2 text-sm text-[var(--color-error)]" role="alert">{errAt(f.k)}</p>}
                <ol className="space-y-3">
                  {items.map((item, i) => (
                    <li key={i} className="rounded-xl border border-line bg-ivory/40 p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{(item[f.titleKey] as string) || `${f.itemLabel} ${i + 1}`}</p>
                        <div className="flex shrink-0 gap-1">
                          <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="grid size-8 place-items-center rounded-md hover:bg-white disabled:opacity-30" aria-label={`Move ${f.itemLabel} ${i + 1} up`}><ChevronUp className="size-4" /></button>
                          <button type="button" disabled={i === items.length - 1} onClick={() => move(i, 1)} className="grid size-8 place-items-center rounded-md hover:bg-white disabled:opacity-30" aria-label={`Move ${f.itemLabel} ${i + 1} down`}><ChevronDown className="size-4" /></button>
                          <button type="button" disabled={items.length <= f.min} onClick={() => set(f.k, items.filter((_, j) => j !== i))} className="grid size-8 place-items-center rounded-md text-[var(--color-error)] hover:bg-white disabled:opacity-30" aria-label={`Remove ${f.itemLabel} ${i + 1}`}><Trash2 className="size-4" /></button>
                        </div>
                      </div>
                      <SpecForm fields={f.item} value={item} onChange={(x) => set(f.k, items.map((it, j) => (j === i ? x : it)))} errors={errors} path={`${path}${f.k}.${i}.`} />
                    </li>
                  ))}
                </ol>
                {items.length < f.max && (
                  <button type="button" onClick={() => set(f.k, [...items, { ...f.blank }])} className="btn btn-ghost mt-3 min-h-9 px-3 text-sm"><Plus className="size-4" aria-hidden="true" />Add {f.itemLabel}</button>
                )}
              </fieldset>
            );
          }
        }
      })}
    </div>
  );
}
