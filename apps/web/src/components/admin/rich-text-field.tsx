'use client';

import { useId, useState } from 'react';
import { cn } from '@/lib/format';
import { RichText } from '@/components/content/rich-text';

const HELP: Array<[string, string]> = [
  ['## Heading', 'Section heading'],
  ['- item', 'Bulleted list (one per line)'],
  ['1. item', 'Numbered list'],
  ['**bold**', 'Bold text'],
  ['[text](/contact)', 'Link to a page, https://, mailto: or tel:'],
  ['Blank line', 'New paragraph'],
];

/** Plain-text editor for "simple formatting", with a preview that renders exactly like the website. */
export function RichTextField({ label, value, onChange, hint, error, rows = 14, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; error?: string; rows?: number; maxLength?: number;
}) {
  const id = useId();
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
        <label htmlFor={id} className="field-label">{label}</label>
        <div role="tablist" aria-label={`${label} view`} className="inline-flex rounded-lg border border-line p-0.5 text-xs">
          {(['write', 'preview'] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn('rounded-md px-2.5 py-1 font-medium capitalize', tab === t ? 'bg-primary text-inverse' : 'text-muted hover:text-ink')}>{t}</button>
          ))}
        </div>
      </div>
      {tab === 'write' ? (
        <textarea id={id} value={value} rows={rows} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className="field font-[450] leading-relaxed" aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-err` : ''}`} spellCheck />
      ) : (
        <div className="min-h-48 rounded-[var(--radius-input,0.75rem)] border border-line bg-white px-5 py-4" aria-live="polite">
          {value.trim() ? <RichText text={value} className="text-[0.9375rem] leading-relaxed" /> : <p className="text-sm text-muted">Nothing to preview yet.</p>}
        </div>
      )}
      {error && <p id={`${id}-err`} className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
      <details id={`${id}-help`} className="mt-2 text-sm">
        <summary className="cursor-pointer text-muted hover:text-ink">{hint ?? 'Formatting'}</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg bg-ivory/60 p-3">
          {HELP.map(([code, what]) => (
            <div key={code} className="contents"><dt><code className="rounded bg-white px-1.5 py-0.5 text-xs">{code}</code></dt><dd className="text-muted">{what}</dd></div>
          ))}
        </dl>
      </details>
      {maxLength && <p className="mt-1 text-right text-xs text-muted">{value.length.toLocaleString('en-IN')}/{maxLength.toLocaleString('en-IN')}</p>}
    </div>
  );
}
