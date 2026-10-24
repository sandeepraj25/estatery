'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import { useForm, type FieldValues, type Path, type UseFormReturn } from 'react-hook-form';
import { z } from 'zod';
import { forgotPasswordSchema, loginSchema, passwordSchema } from '@estatery/shared';
import { AdminRequestError, adminRequest, ensureCsrf } from '@/lib/admin-client';

function Field<T extends FieldValues>({ form, name, label, type = 'text', autoComplete, hint }: {
  form: UseFormReturn<T>; name: Path<T>; label: string; type?: string; autoComplete?: string; hint?: string;
}) {
  const id = useId();
  const err = form.formState.errors[name]?.message as string | undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">{label}</label>
      <input id={id} type={type} autoComplete={autoComplete} className="field" aria-invalid={!!err} aria-describedby={err ? `${id}-e` : hint ? `${id}-h` : undefined} {...form.register(name)} />
      {hint && !err && <p id={`${id}-h`} className="mt-1.5 text-sm text-muted">{hint}</p>}
      {err && <p id={`${id}-e`} className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{err}</p>}
    </div>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return <p className="rounded-lg bg-[var(--color-error)]/8 px-4 py-3 text-sm text-[var(--color-error)]" role="alert">{message}</p>;
}

function applyServerError<T extends FieldValues>(form: UseFormReturn<T>, e: unknown, set: (m: string) => void) {
  if (e instanceof AdminRequestError) {
    e.fields.forEach((f) => form.setError(f.path as Path<T>, { message: f.message }));
    set(e.message);
  } else set('We couldn’t reach the server. Check your connection and try again.');
}

/** Only same-site admin paths are allowed as post-login destinations (no open redirects). */
function safeNext(next: string | null) {
  return next && /^\/admin(\/[\w-]*)*$/.test(next) ? next : '/admin';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  useEffect(() => void ensureCsrf(), []);

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit(async (v) => {
        setError(null);
        try {
          await adminRequest('auth/login', { method: 'POST', body: v });
          router.replace(safeNext(params.get('next')));
          router.refresh();
        } catch (e) {
          applyServerError(form, e, setError);
        }
      })}
    >
      <FormError message={error} />
      <Field form={form} name="email" label="Email" type="email" autoComplete="username" />
      <Field form={form} name="password" label="Password" type="password" autoComplete="current-password" />
      <button type="submit" disabled={form.formState.isSubmitting} className="btn btn-primary w-full disabled:opacity-70">
        {form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-center text-sm"><Link href="/admin/forgot-password" className="text-muted underline-offset-4 hover:text-ink hover:underline">Forgot your password?</Link></p>
    </form>
  );
}

export function ForgotForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof forgotPasswordSchema>>({ resolver: zodResolver(forgotPasswordSchema) });
  useEffect(() => void ensureCsrf(), []);
  if (sent) {
    return (
      <div role="status" className="space-y-4">
        <p className="rounded-lg bg-[var(--color-success)]/10 px-4 py-3 text-sm text-[var(--color-success)]">{sent}</p>
        <p className="text-sm text-muted">The link expires in 30 minutes. Check your spam folder if it doesn’t arrive.</p>
        <Link href="/admin/login" className="btn btn-ghost w-full">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form noValidate className="space-y-5" onSubmit={form.handleSubmit(async (v) => {
      setError(null);
      try {
        const r = await adminRequest<{ message: string }>('auth/forgot-password', { method: 'POST', body: v });
        setSent(r.message);
      } catch (e) {
        applyServerError(form, e, setError);
      }
    })}>
      <FormError message={error} />
      <Field form={form} name="email" label="Email" type="email" autoComplete="username" />
      <button type="submit" disabled={form.formState.isSubmitting} className="btn btn-primary w-full disabled:opacity-70">
        {form.formState.isSubmitting ? 'Sending…' : 'Send reset link'}
      </button>
      <p className="text-center text-sm"><Link href="/admin/login" className="text-muted hover:text-ink hover:underline">Back to sign in</Link></p>
    </form>
  );
}

const newPassword = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: 'Passwords don’t match', path: ['confirm'] });
const PASSWORD_HINT = 'At least 10 characters, with a letter and a number.';

export function ResetForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof newPassword>>({ resolver: zodResolver(newPassword) });
  useEffect(() => void ensureCsrf(), []);
  if (done) {
    return (
      <div role="status" className="space-y-4">
        <p className="rounded-lg bg-[var(--color-success)]/10 px-4 py-3 text-sm text-[var(--color-success)]">Password updated. You’ve been signed out on all devices.</p>
        <Link href="/admin/login" className="btn btn-primary w-full">Sign in with your new password</Link>
      </div>
    );
  }
  return (
    <form noValidate className="space-y-5" onSubmit={form.handleSubmit(async (v) => {
      setError(null);
      try {
        await adminRequest('auth/reset-password', { method: 'POST', body: { token, password: v.password } });
        setDone(true);
      } catch (e) {
        applyServerError(form, e, setError);
      }
    })}>
      <FormError message={error} />
      <Field form={form} name="password" label="New password" type="password" autoComplete="new-password" hint={PASSWORD_HINT} />
      <Field form={form} name="confirm" label="Confirm new password" type="password" autoComplete="new-password" />
      <button type="submit" disabled={form.formState.isSubmitting} className="btn btn-primary w-full disabled:opacity-70">
        {form.formState.isSubmitting ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

export function AcceptInviteForm({ token, hasAccount }: { token: string; hasAccount: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const schema = hasAccount
    ? z.object({ name: z.string().optional(), password: z.string().min(1, 'Enter your password'), confirm: z.string().optional() })
    : newPassword.and(z.object({ name: z.string().trim().min(2, 'Enter your name').max(80) }));
  const form = useForm<{ name?: string; password: string; confirm?: string }>({ resolver: zodResolver(schema as never) });
  useEffect(() => void ensureCsrf(), []);
  return (
    <form noValidate className="space-y-5" onSubmit={form.handleSubmit(async (v) => {
      setError(null);
      try {
        await adminRequest('auth/accept-invite', { method: 'POST', body: { token, name: v.name || 'Team member', password: v.password } });
        router.replace('/admin');
        router.refresh();
      } catch (e) {
        applyServerError(form, e, setError);
      }
    })}>
      <FormError message={error} />
      {!hasAccount && <Field form={form} name="name" label="Your full name" autoComplete="name" />}
      <Field
        form={form}
        name="password"
        label={hasAccount ? 'Your existing password' : 'Choose a password'}
        type="password"
        autoComplete={hasAccount ? 'current-password' : 'new-password'}
        hint={hasAccount ? 'You already have an account with this email on another site.' : PASSWORD_HINT}
      />
      {!hasAccount && <Field form={form} name="confirm" label="Confirm password" type="password" autoComplete="new-password" />}
      <button type="submit" disabled={form.formState.isSubmitting} className="btn btn-primary w-full disabled:opacity-70">
        {form.formState.isSubmitting ? 'Joining…' : 'Accept invitation'}
      </button>
    </form>
  );
}
