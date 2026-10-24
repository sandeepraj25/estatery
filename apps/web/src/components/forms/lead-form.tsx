'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createLeadSchema } from '@estatery/shared';
import { cn } from '@/lib/format';

/** Client-side schema mirrors the server one (server re-validates everything). */
const formSchema = createLeadSchema.pick({ name: true, email: true, phone: true, message: true, intent: true, preferredDate: true, budget: true }).extend({
  consent: z.boolean().refine((v) => v, 'Please agree to be contacted'),
  website: z.string().optional(),
});
type FormValues = z.input<typeof formSchema>;

interface Props {
  propertyId?: string;
  propertyTitle?: string;
  tone?: 'light' | 'dark';
  /** Show the "visit date" field (site-visit bookings on property pages). */
  allowVisit?: boolean;
  source?: string;
  submitLabel?: string;
}

export function LeadForm({ propertyId, propertyTitle, tone = 'light', allowVisit = false, source = 'website', submitLabel }: Props) {
  const id = useId();
  const [status, setStatus] = useState<'idle' | 'sent'>('idle');
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register, handleSubmit, watch, setError, reset, formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      intent: allowVisit ? 'site-visit' : propertyId ? 'enquiry' : 'general',
      message: propertyTitle ? `I'd like to know more about ${propertyTitle}.` : '',
      consent: false,
    },
  });
  const intent = watch('intent');

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...values,
        consent: values.consent === true ? true : undefined,
        preferredDate: values.intent === 'site-visit' && values.preferredDate ? values.preferredDate : undefined,
        budget: values.budget || undefined,
        propertyId,
        source,
      }),
    }).catch(() => null);
    if (!res) return setServerError('We couldn’t reach the server. Check your connection and try again.');
    if (res.ok) {
      setStatus('sent');
      reset();
      return;
    }
    const body = await res.json().catch(() => null);
    const fields: Array<{ path: string; message: string }> = body?.error?.fields ?? [];
    fields.forEach((f) => setError(f.path as keyof FormValues, { message: f.message }));
    setServerError(res.status === 429 ? 'You’ve sent several requests in a row. Please wait a minute and try again.' : (body?.error?.message ?? 'Your request didn’t go through. Please try again.'));
  }

  const dark = tone === 'dark';
  const label = cn('field-label mb-1.5 block', dark && 'text-muted-inverse');
  const err = (msg?: string) => msg && <p className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{msg}</p>;
  const errDark = (msg?: string) => msg && <p className="mt-1.5 text-sm text-[#ffb4a8]" role="alert">{msg}</p>;
  const E = dark ? errDark : err;

  if (status === 'sent') {
    return (
      <div className={cn('rounded-[var(--radius-card)] p-8', dark ? 'bg-white/8 ring-1 ring-white/15' : 'bg-white ring-1 ring-line')} role="status">
        <CheckCircle2 className="size-8 text-[var(--color-success)]" aria-hidden="true" />
        <p className="mt-4 font-heading text-xl font-semibold">Request received</p>
        <p className={cn('mt-2', dark ? 'text-muted-inverse' : 'text-muted')}>An advisor will call you within one working day.</p>
        <button type="button" onClick={() => setStatus('idle')} className={cn('btn mt-6', dark ? 'btn-ghost-inverse' : 'btn-ghost')}>Send another request</button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="grid gap-4 sm:grid-cols-2">
      {/* Honeypot: hidden from people and assistive tech, often filled by bots. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`${id}-website`}>Website</label>
        <input id={`${id}-website`} tabIndex={-1} autoComplete="off" {...register('website')} />
      </div>

      <div className="sm:col-span-2">
        <span className={label} id={`${id}-intent-label`}>How can we help?</span>
        <div role="radiogroup" aria-labelledby={`${id}-intent-label`} className="flex flex-wrap gap-2">
          {(propertyId
            ? [['enquiry', 'Ask a question'], ['callback', 'Request a call'], ['site-visit', 'Book a visit']]
            : [['general', 'Find me a home'], ['callback', 'Request a call'], ['site-visit', 'Arrange viewings']]
          ).map(([value, text]) => (
            <label key={value} className="cursor-pointer">
              <input type="radio" value={value} {...register('intent')} className="peer sr-only" />
              <span className={cn(
                'inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-accent',
                dark ? 'border-white/25 text-white/80 peer-checked:border-accent peer-checked:bg-accent peer-checked:text-primary' : 'border-line text-ink/80 peer-checked:border-primary peer-checked:bg-primary peer-checked:text-inverse',
              )}>{text}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={label} htmlFor={`${id}-name`}>Full name</label>
        <input id={`${id}-name`} autoComplete="name" className="field" aria-invalid={!!errors.name} {...register('name')} />
        {E(errors.name?.message)}
      </div>
      <div>
        <label className={label} htmlFor={`${id}-phone`}>Phone</label>
        <input id={`${id}-phone`} type="tel" autoComplete="tel" inputMode="tel" placeholder="+91" className="field" aria-invalid={!!errors.phone} {...register('phone')} />
        {E(errors.phone?.message)}
      </div>
      <div className={allowVisit || intent === 'site-visit' ? '' : 'sm:col-span-2'}>
        <label className={label} htmlFor={`${id}-email`}>Email</label>
        <input id={`${id}-email`} type="email" autoComplete="email" className="field" aria-invalid={!!errors.email} {...register('email')} />
        {E(errors.email?.message)}
      </div>
      {intent === 'site-visit' && (
        <div>
          <label className={label} htmlFor={`${id}-date`}>Preferred date</label>
          <input id={`${id}-date`} type="date" min={new Date().toISOString().slice(0, 10)} className="field" {...register('preferredDate')} />
        </div>
      )}
      {!propertyId && (
        <div className="sm:col-span-2">
          <label className={label} htmlFor={`${id}-budget`}>Budget (optional)</label>
          <select id={`${id}-budget`} className="field" {...register('budget')}>
            <option value="">Prefer not to say</option>
            <option>Under ₹2 Cr</option>
            <option>₹2 – 5 Cr</option>
            <option>₹5 – 10 Cr</option>
            <option>₹10 – 25 Cr</option>
            <option>Above ₹25 Cr</option>
          </select>
        </div>
      )}
      <div className="sm:col-span-2">
        <label className={label} htmlFor={`${id}-message`}>Message (optional)</label>
        <textarea id={`${id}-message`} rows={3} className="field" {...register('message')} />
        {E(errors.message?.message)}
      </div>

      <div className="sm:col-span-2">
        <label className={cn('flex cursor-pointer items-start gap-3 text-sm', dark ? 'text-white/75' : 'text-ink/75')}>
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--color-accent)]" aria-invalid={!!errors.consent} {...register('consent')} />
          <span>I agree to be contacted by phone, email or WhatsApp about my request.</span>
        </label>
        {E(errors.consent?.message)}
      </div>

      {serverError && <p className={cn('sm:col-span-2 rounded-lg px-4 py-3 text-sm', dark ? 'bg-[#B42318]/25 text-[#ffd5cf]' : 'bg-[#B42318]/8 text-[var(--color-error)]')} role="alert">{serverError}</p>}

      <div className="sm:col-span-2">
        <button type="submit" disabled={isSubmitting} className={cn('btn w-full sm:w-auto', dark ? 'btn-accent' : 'btn-primary', 'disabled:opacity-70')}>
          {isSubmitting ? 'Sending…' : (submitLabel ?? (intent === 'site-visit' ? 'Request a visit' : intent === 'callback' ? 'Request a call' : 'Send request'))}
        </button>
      </div>
    </form>
  );
}
