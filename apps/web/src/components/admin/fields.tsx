'use client';

import { useEffect, useId, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/**
 * Small, controlled form controls for the CMS. Every control has a visible label, an optional
 * hint, and an error slot wired to aria-describedby.
 */
interface Base {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
}

function Wrap({ id, label, hint, error, className, children, optional }: Base & { id: string; children: ReactNode; optional?: boolean }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {label}
        {optional && <span className="ml-1 font-normal text-muted">(optional)</span>}
      </label>
      {children}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">{hint}</p>}
      {error && <p id={`${id}-err`} className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
    </div>
  );
}

const describedBy = (id: string, hint?: string, error?: string) => (error ? `${id}-err` : hint ? `${id}-hint` : undefined);

export function TextField({ value, onChange, type = 'text', placeholder, optional, maxLength, inputMode, ...b }: Base & {
  value: string | number | null | undefined; onChange: (v: string) => void; type?: string; placeholder?: string; optional?: boolean; maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  const id = useId();
  return (
    <Wrap id={id} {...b} optional={optional}>
      <input
        id={id} type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength} inputMode={inputMode}
        className="field" aria-invalid={!!b.error} aria-describedby={describedBy(id, b.hint, b.error)}
      />
    </Wrap>
  );
}

export function TextArea({ value, onChange, rows = 4, optional, maxLength, ...b }: Base & { value: string; onChange: (v: string) => void; rows?: number; optional?: boolean; maxLength?: number }) {
  const id = useId();
  return (
    <Wrap id={id} {...b} optional={optional}>
      <textarea id={id} value={value} rows={rows} maxLength={maxLength} onChange={(e) => onChange(e.target.value)} className="field" aria-invalid={!!b.error} aria-describedby={describedBy(id, b.hint, b.error)} />
      {maxLength && <p className="mt-1 text-right text-xs text-muted">{value.length}/{maxLength}</p>}
    </Wrap>
  );
}

export function SelectField<T extends string>({ value, onChange, options, ...b }: Base & { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }> }) {
  const id = useId();
  return (
    <Wrap id={id} {...b}>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="field cursor-pointer" aria-invalid={!!b.error} aria-describedby={describedBy(id, b.hint, b.error)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Wrap>
  );
}

export function Toggle({ checked, onChange, label, hint, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium">{label}</label>
        {hint && <p id={`${id}-hint`} className="text-sm text-muted">{hint}</p>}
      </div>
      <button
        id={id} type="button" role="switch" aria-checked={checked} aria-describedby={hint ? `${id}-hint` : undefined} disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-primary' : 'bg-line')}
      >
        <span className={cn('absolute left-0 top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Comma/Enter-separated tags (amenities, languages, specialities). */
export function TagsField({ value, onChange, suggestions = [], max = 40, ...b }: Base & { value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; max?: number }) {
  const id = useId();
  const add = (raw: string) => {
    const items = raw.split(',').map((x) => x.trim()).filter(Boolean);
    if (!items.length) return;
    onChange([...new Set([...value, ...items])].slice(0, max));
  };
  return (
    <Wrap id={id} {...b}>
      <div className="field flex min-h-12 flex-wrap items-center gap-1.5 py-2">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-ivory px-2.5 py-1 text-sm">
            {t}
            <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="text-muted hover:text-ink" aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        <input
          id={id}
          className="min-w-32 flex-1 bg-transparent outline-none"
          placeholder={value.length ? '' : 'Type and press Enter'}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(e.currentTarget.value);
              e.currentTarget.value = '';
            } else if (e.key === 'Backspace' && !e.currentTarget.value && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={(e) => {
            add(e.currentTarget.value);
            e.currentTarget.value = '';
          }}
          aria-describedby={describedBy(id, b.hint, b.error)}
        />
      </div>
      {suggestions.filter((s) => !value.includes(s)).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {suggestions.filter((s) => !value.includes(s)).slice(0, 12).map((s) => (
            <button key={s} type="button" onClick={() => onChange([...value, s].slice(0, max))} className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-sm text-muted hover:border-ink hover:text-ink">+ {s}</button>
          ))}
        </div>
      )}
    </Wrap>
  );
}

/** Warns before leaving the page with unsaved edits. */
export function useUnsavedGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-line bg-white">
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-heading text-base font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      </div>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

export function Notice({ tone, children, onDismiss }: { tone: 'error' | 'success' | 'info'; children: ReactNode; onDismiss?: () => void }) {
  const cls = tone === 'error' ? 'bg-[var(--color-error)]/8 text-[var(--color-error)]' : tone === 'success' ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-accent/15 text-ink';
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cn('flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm', cls)}>
      <div>{children}</div>
      {onDismiss && <button type="button" onClick={onDismiss} className="shrink-0 opacity-70 hover:opacity-100" aria-label="Dismiss">×</button>}
    </div>
  );
}
