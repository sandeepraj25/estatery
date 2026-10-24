'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { DEFAULT_THEME_PRESET, THEME_PRESETS } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { SelectField, TextField } from './fields';

const toSlug = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function NewAgency({ platformDomain }: { platformDomain: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', ownerName: '', ownerEmail: '', themePreset: DEFAULT_THEME_PRESET });
  const [slugEdited, setSlugEdited] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ hostname: string; emailed: boolean; inviteUrl: string | null } | null>(null);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v, ...(k === 'name' && !slugEdited ? { slug: toSlug(v) } : {}) }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrors({});
    try {
      const r = await adminRequest<{ hostname: string; emailed: boolean; inviteUrl: string | null }>('platform/tenants', { method: 'POST', body: form });
      setDone(r);
      router.refresh();
    } catch (err) {
      if (err instanceof AdminRequestError) {
        setErrors(Object.fromEntries(err.fields.map((f) => [f.path, f.message])));
        setError(err.message);
      } else setError('The agency wasn’t created. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  function close(o: boolean) {
    setOpen(o);
    if (!o) {
      setDone(null);
      setForm({ name: '', slug: '', ownerName: '', ownerEmail: '', themePreset: DEFAULT_THEME_PRESET });
      setSlugEdited(false);
    }
  }

  const local = platformDomain === 'localhost';
  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Trigger className="btn btn-primary min-h-10"><Plus className="size-4" aria-hidden="true" />New agency</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90dvh] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-lift outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-heading text-lg font-semibold">{done ? 'Agency created' : 'New agency'}</Dialog.Title>
            <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
          </div>
          {done ? (
            <div className="mt-3 space-y-4 text-sm">
              <Dialog.Description className="text-muted">The site is live with starter content and a 14-day Professional trial. {done.emailed ? 'The owner has been emailed an invitation.' : 'Email isn’t configured, so send the owner the invitation link below.'}</Dialog.Description>
              <p>Site: <a className="font-medium underline decoration-accent underline-offset-4" href={`${local ? 'http' : 'https'}://${done.hostname}${local ? ':3000' : ''}`} target="_blank" rel="noopener">{done.hostname}</a></p>
              {done.inviteUrl && (
                <div>
                  <p className="font-medium">Owner invitation (development only)</p>
                  <input readOnly value={done.inviteUrl} onFocus={(e) => e.currentTarget.select()} className="field mt-1 font-mono text-xs" aria-label="Invitation link" />
                </div>
              )}
              <div className="flex justify-end"><Dialog.Close className="btn btn-primary min-h-10">Done</Dialog.Close></div>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-4">
              <Dialog.Description className="text-sm text-muted">Creates the website and Admin Panel with starter content, and invites the owner.</Dialog.Description>
              {error && <p role="alert" className="rounded-lg bg-[var(--color-error)]/8 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>}
              <TextField label="Agency name" value={form.name} onChange={(v) => set('name', v)} maxLength={80} error={errors.name} />
              <TextField label="Web address" value={form.slug} onChange={(v) => { setSlugEdited(true); set('slug', v.toLowerCase()); }} error={errors.slug} hint={`${form.slug || 'agency'}.${platformDomain} — they can connect their own domain later.`} />
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField label="Owner’s name" value={form.ownerName} onChange={(v) => set('ownerName', v)} error={errors.ownerName} />
                <TextField label="Owner’s email" type="email" value={form.ownerEmail} onChange={(v) => set('ownerEmail', v)} error={errors.ownerEmail} />
              </div>
              <SelectField label="Starting look" value={form.themePreset} onChange={(v) => set('themePreset', v)} options={Object.entries(THEME_PRESETS).map(([id, p]) => ({ value: id, label: p.label }))} hint="The owner can change colours and fonts any time." />
              <div className="flex justify-end gap-2 pt-2">
                <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
                <button type="submit" disabled={busy || !form.name || !form.slug || !form.ownerEmail || !form.ownerName} className="btn btn-primary min-h-10 disabled:opacity-50">{busy ? 'Creating…' : 'Create agency'}</button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
