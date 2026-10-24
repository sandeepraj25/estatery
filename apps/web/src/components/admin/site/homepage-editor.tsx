'use client';

import { ChevronRight, Eye, EyeOff, Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Homepage, HomeSection } from '@estatery/shared';
import { AdminRequestError } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice, useUnsavedGuard } from '../fields';
import { SortableList } from '../sortable';
import { fieldErrors, saveDraft } from './draft-api';
import { SECTION_META } from './section-specs';
import { SpecForm } from './spec-form';
import { useHistory } from './use-history';

function sectionTitle(s: HomeSection) {
  const d = s.data as Record<string, unknown>;
  return (d.headline as string) || (d.title as string) || SECTION_META[s.type].description;
}

export function HomepageEditor({ initial, revision, defaults, canEdit, onSaved }: {
  initial: Homepage; revision: number; defaults: Homepage; canEdit: boolean; onSaved: (revision: number) => void;
}) {
  const h = useHistory<Homepage>(initial);
  const [baseline, setBaseline] = useState(initial);
  const [rev, setRev] = useState(revision);
  const [open, setOpen] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(h.state) !== JSON.stringify(baseline);
  useUnsavedGuard(dirty);

  const sections = h.state.sections;
  const update = (id: string, patch: Partial<HomeSection>) =>
    h.set((p) => ({ sections: p.sections.map((s) => (s.id === id ? ({ ...s, ...patch } as HomeSection) : s)) }));

  async function save() {
    setSaving(true);
    setNotice(null);
    setErrors({});
    try {
      const r = await saveDraft('homepage', h.state, rev);
      setRev(r.revision);
      setBaseline(h.state);
      onSaved(r.revision);
      setNotice({ tone: 'success', text: 'Draft saved. Check the preview, then publish when you’re ready.' });
    } catch (e) {
      if (e instanceof AdminRequestError) {
        const errs = fieldErrors(e.fields);
        setErrors(errs);
        // Open the first section with an error so it's visible.
        const first = Object.keys(errs)[0]?.match(/^sections\.(\d+)/);
        if (first) setOpen(sections[Number(first[1])]?.id ?? null);
        setNotice({ tone: 'error', text: e.status === 409 ? e.message : `${e.message} The affected section is open below.` });
      } else setNotice({ tone: 'error', text: 'The draft didn’t save. Check your connection and try again.' });
    } finally {
      setSaving(false);
    }
  }

  // Cmd/Ctrl+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && canEdit && !saving) void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const errorsFor = (index: number) =>
    Object.fromEntries(Object.entries(errors).filter(([k]) => k.startsWith(`sections.${index}.data.`)).map(([k, v]) => [k.replace(`sections.${index}.data.`, ''), v]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1">
          <button type="button" onClick={h.undo} disabled={!h.canUndo} className="btn btn-ghost min-h-9 bg-white px-3 text-sm disabled:opacity-40" title="Undo (⌘Z)"><Undo2 className="size-4" aria-hidden="true" />Undo</button>
          <button type="button" onClick={h.redo} disabled={!h.canRedo} className="btn btn-ghost min-h-9 bg-white px-3 text-sm disabled:opacity-40" title="Redo (⇧⌘Z)"><Redo2 className="size-4" aria-hidden="true" />Redo</button>
          <button
            type="button" disabled={!canEdit}
            onClick={() => window.confirm('Replace every homepage section with the default layout? Your current draft content will be lost unless you undo before saving.') && h.set(defaults)}
            className="btn btn-ghost min-h-9 bg-white px-3 text-sm"
          >
            <RotateCcw className="size-4" aria-hidden="true" />Reset to default
          </button>
        </div>
        <button type="button" onClick={save} disabled={!dirty || saving || !canEdit} className="btn btn-primary min-h-10 disabled:opacity-50">
          {saving ? 'Saving…' : dirty ? 'Save draft' : 'Draft saved'}
        </button>
      </div>
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <p className="text-sm text-muted">Drag sections to change their order. Hidden sections stay in your draft but don’t appear on the site.</p>
      <SortableList
        label="Homepage sections"
        items={sections}
        onReorder={(next) => h.set({ sections: next })}
        render={(s, handle, index) => {
          const meta = SECTION_META[s.type];
          const isOpen = open === s.id;
          const hasError = Object.keys(errorsFor(index)).length > 0;
          return (
            <div className={cn('rounded-xl border bg-white', hasError ? 'border-[var(--color-error)]' : 'border-line', !s.enabled && 'bg-ivory/60')}>
              <div className="flex items-center gap-2 p-2 pr-3">
                {handle}
                <button type="button" onClick={() => setOpen(isOpen ? null : s.id)} aria-expanded={isOpen} aria-controls={`section-${s.id}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-ivory">
                  <ChevronRight className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-90')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className={cn('block text-sm font-semibold', !s.enabled && 'text-muted')}>{meta.label}{!s.enabled && ' · hidden'}</span>
                    <span className="block truncate text-sm text-muted">{sectionTitle(s)}</span>
                  </span>
                </button>
                <button
                  type="button" disabled={!canEdit} onClick={() => update(s.id, { enabled: !s.enabled })}
                  className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-ivory hover:text-ink"
                  aria-label={s.enabled ? `Hide ${meta.label}` : `Show ${meta.label}`} aria-pressed={!s.enabled} title={s.enabled ? 'Hide section' : 'Show section'}
                >
                  {s.enabled ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                </button>
              </div>
              {isOpen && (
                <fieldset id={`section-${s.id}`} disabled={!canEdit} className="border-t border-line p-5">
                  <legend className="sr-only">{meta.label} settings</legend>
                  <p className="mb-5 text-sm text-muted">{meta.description}</p>
                  <SpecForm fields={meta.fields} value={s.data as Record<string, unknown>} onChange={(data) => update(s.id, { data } as Partial<HomeSection>)} errors={errorsFor(index)} />
                </fieldset>
              )}
            </div>
          );
        }}
      />
    </div>
  );
}
