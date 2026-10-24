'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { passwordSchema } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';

const schema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });

export function ChangePasswordForm() {
  const id = useId();
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const form = useForm<z.input<typeof schema>>({ resolver: zodResolver(schema) });
  const fields: Array<{ name: 'currentPassword' | 'newPassword' | 'confirm'; label: string; ac: string; hint?: string }> = [
    { name: 'currentPassword', label: 'Current password', ac: 'current-password' },
    { name: 'newPassword', label: 'New password', ac: 'new-password', hint: 'At least 10 characters, with a letter and a number.' },
    { name: 'confirm', label: 'Confirm new password', ac: 'new-password' },
  ];
  return (
    <form noValidate className="max-w-md space-y-4" onSubmit={form.handleSubmit(async (v) => {
      setStatus(null);
      try {
        await adminRequest('auth/change-password', { method: 'POST', body: { currentPassword: v.currentPassword, newPassword: v.newPassword } });
        form.reset();
        setStatus({ ok: true, message: 'Password changed. Other devices have been signed out.' });
      } catch (e) {
        if (e instanceof AdminRequestError) e.fields.forEach((f) => form.setError(f.path as 'currentPassword', { message: f.message }));
        setStatus({ ok: false, message: e instanceof AdminRequestError ? e.message : 'Your password wasn’t changed. Please try again.' });
      }
    })}>
      {status && <p role={status.ok ? 'status' : 'alert'} className={`rounded-lg px-4 py-3 text-sm ${status.ok ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-error)]/8 text-[var(--color-error)]'}`}>{status.message}</p>}
      {fields.map((f) => {
        const err = form.formState.errors[f.name]?.message;
        return (
          <div key={f.name}>
            <label htmlFor={`${id}-${f.name}`} className="mb-1.5 block text-sm font-medium">{f.label}</label>
            <input id={`${id}-${f.name}`} type="password" autoComplete={f.ac} className="field" aria-invalid={!!err} {...form.register(f.name)} />
            {f.hint && !err && <p className="mt-1.5 text-sm text-muted">{f.hint}</p>}
            {err && <p className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{err}</p>}
          </div>
        );
      })}
      <button type="submit" disabled={form.formState.isSubmitting} className="btn btn-primary min-h-10 disabled:opacity-70">{form.formState.isSubmitting ? 'Saving…' : 'Change password'}</button>
    </form>
  );
}

export function SignOutEverywhere() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm('Sign out on every device, including this one?')) return;
        setBusy(true);
        await adminRequest('auth/logout-all', { method: 'POST' }).catch(() => undefined);
        router.replace('/admin/login');
        router.refresh();
      }}
      className="btn btn-ghost min-h-10"
    >
      {busy ? 'Signing out…' : 'Sign out on all devices'}
    </button>
  );
}
