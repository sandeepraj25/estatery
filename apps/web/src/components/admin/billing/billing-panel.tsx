'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Minus, ReceiptText, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  formatInr, isUpgrade, PLAN_CODES, PLANS,
  type BillingInterval, type BillingOverview, type Entitlements, type PlanCode,
} from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice } from '../fields';
import { openRazorpayCheckout, type CheckoutSession } from './razorpay';

const LIVE = ['authenticated', 'active', 'pending', 'halted'];
const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
const shortDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
const daysUntil = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);

const STATE_LABEL: Record<BillingOverview['access']['state'], { text: string; tone: string }> = {
  trial: { text: 'Free trial', tone: 'bg-accent/25 text-ivory' },
  active: { text: 'Active', tone: 'bg-[#9fd3b0]/20 text-[#bfe6cb]' },
  past_due: { text: 'Payment due', tone: 'bg-amber-200/20 text-amber-100' },
  grace: { text: 'On hold', tone: 'bg-red-300/20 text-red-100' },
  restricted: { text: 'Inactive', tone: 'bg-white/15 text-white/80' },
};

function featureRows(e: Entitlements): Array<[ok: boolean, label: string]> {
  return [
    [true, e.listings === null ? 'Unlimited live listings' : `${e.listings} live listings`],
    [true, `${e.seats} team members`],
    [true, `${e.customDomains} custom domain${e.customDomains === 1 ? '' : 's'}`],
    [e.leadExport, 'Export leads to CSV'],
    [e.roundRobin, 'Share enquiries between advisors'],
    [e.removeBranding, 'Hide “Powered by Estatery”'],
  ];
}

function Meter({ label, used, limit, paused }: { label: string; used: number; limit: number | null; paused?: boolean }) {
  if (paused) {
    return (
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-muted">{used} · adding paused</span>
      </div>
    );
  }
  const pct = limit === null ? 0 : limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const over = limit !== null && used >= limit;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className={cn('tabular-nums', over ? 'font-semibold text-[var(--color-error)]' : 'text-muted')}>
          {used}{limit === null ? '' : ` of ${limit}`}{limit === null && <span className="ml-1">· unlimited</span>}
        </span>
      </div>
      {limit !== null && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-label={label} aria-valuenow={used} aria-valuemin={0} aria-valuemax={limit}>
          <div className={cn('h-full rounded-full', over ? 'bg-[var(--color-error)]' : 'bg-primary')} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

type Confirm = { title: string; body: string; action: string; run: () => Promise<void>; withReason?: boolean } | null;

export function BillingPanel({ data, businessName }: { data: BillingOverview; businessName: string }) {
  const router = useRouter();
  const { access, billing, usage, mode } = data;
  const live = LIVE.includes(billing.status) && !!data.subscriptionId;
  const [interval, setBillingInterval] = useState<BillingInterval>(billing.interval ?? 'monthly');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [sim, setSim] = useState<CheckoutSession | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [reason, setReason] = useState('');

  const fail = (e: unknown) => setNotice({ tone: 'error', text: e instanceof AdminRequestError || e instanceof Error ? e.message : 'That didn’t work. Please try again.' });

  async function pay(session: CheckoutSession) {
    if (session.mode === 'test') return setSim(session);
    await openRazorpayCheckout(session, {
      onSuccess: async (r) => {
        try {
          await adminRequest('admin/billing/verify', { method: 'POST', body: r });
          setNotice({ tone: 'success', text: `You’re subscribed to ${PLANS[session.plan].name}. A receipt is on its way to your inbox.` });
          router.refresh();
        } catch (e) {
          fail(e);
        }
      },
      onFailure: (message) => setNotice({ tone: 'error', text: `${message} No money was taken; you can try again.` }),
      onDismiss: () => setNotice({ tone: 'info', text: 'Checkout closed. Nothing was charged.' }),
      color: '#10251D',
    });
  }

  async function choose(plan: PlanCode) {
    setNotice(null);
    setBusy(plan);
    try {
      if (!live) {
        await pay(await adminRequest<CheckoutSession>('admin/billing/checkout', { method: 'POST', body: { plan, interval } }));
        return;
      }
      const r = await adminRequest<{ restartCheckout: boolean; scheduled?: boolean } & Partial<CheckoutSession>>('admin/billing/change', { method: 'POST', body: { plan, interval } });
      if (r.restartCheckout) await pay(r as CheckoutSession);
      else {
        setNotice({ tone: 'success', text: r.scheduled ? `Done. You’ll move to ${PLANS[plan].name} on ${date(billing.paidThrough)}.` : `You’re now on ${PLANS[plan].name}.` });
        router.refresh();
      }
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function askChange(plan: PlanCode) {
    if (!live || !billing.plan || !billing.interval || billing.status === 'authenticated') return void choose(plan);
    const up = isUpgrade({ plan: billing.plan, interval: billing.interval }, { plan, interval });
    const price = formatInr(PLANS[plan].price[interval]);
    setConfirm(up
      ? { title: `Upgrade to ${PLANS[plan].name}?`, body: `The new plan and its limits start right away, billed at ${price} per ${interval === 'yearly' ? 'year' : 'month'} through Razorpay.`, action: 'Upgrade now', run: () => choose(plan) }
      : { title: `Switch to ${PLANS[plan].name}?`, body: `You keep ${PLANS[billing.plan].name} until ${date(billing.paidThrough)}, then pay ${price} per ${interval === 'yearly' ? 'year' : 'month'}. Nothing is removed from your site if you’re over the new limits, but you won’t be able to add more until you’re under them.`, action: 'Schedule the change', run: () => choose(plan) });
  }

  async function keepCurrent() {
    if (!billing.plan || !billing.interval) return;
    setBusy('keep');
    try {
      await adminRequest('admin/billing/change', { method: 'POST', body: { plan: billing.plan, interval: billing.interval } });
      setNotice({ tone: 'success', text: `You’ll stay on ${PLANS[billing.plan].name}.` });
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  function askCancel() {
    const active = billing.status === 'active';
    setReason('');
    setConfirm({
      title: 'Cancel your subscription?',
      body: active
        ? `You keep everything until ${date(billing.paidThrough)} and won’t be charged again. After that your website stays online, but you won’t be able to publish new listings, invite people or connect domains until you choose a plan again.`
        : 'This stops the subscription now. Your website stays online. You can subscribe again at any time, with a different card or UPI account if you like.',
      action: active ? 'Cancel at period end' : 'Cancel subscription',
      withReason: true,
      run: async () => {
        await adminRequest('admin/billing/cancel', { method: 'POST', body: { reason } });
        setNotice({ tone: 'success', text: active ? `Cancelled. Your plan stays active until ${date(billing.paidThrough)}.` : 'Your subscription is cancelled.' });
        router.refresh();
      },
    });
  }

  async function simulate(outcome: 'success' | 'failure', subscriptionId: string, verifyAfter: boolean) {
    setBusy(`sim-${outcome}`);
    try {
      const r = await adminRequest<{ outcome: string; message?: string; razorpay_payment_id?: string; razorpay_subscription_id?: string; razorpay_signature?: string }>('admin/billing/simulate', { method: 'POST', body: { subscriptionId, outcome } });
      if (verifyAfter && r.razorpay_signature) {
        await adminRequest('admin/billing/verify', { method: 'POST', body: { razorpay_payment_id: r.razorpay_payment_id, razorpay_subscription_id: r.razorpay_subscription_id, razorpay_signature: r.razorpay_signature } });
        setNotice({ tone: 'success', text: sim?.firstChargeAt ? `Test payment method approved. ${PLANS[sim.plan].name} starts on ${date(sim.firstChargeAt)}, when your trial ends.` : `Test payment approved. You’re subscribed to ${sim ? PLANS[sim.plan].name : 'the plan'}.` });
      } else {
        setNotice({ tone: outcome === 'success' ? 'success' : 'error', text: r.message ?? (outcome === 'success' ? 'Test payment approved.' : 'Test payment declined.') });
      }
      setSim(null);
      router.refresh();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  const currentPlan = access.plan ? PLANS[access.plan] : null;
  const ent = access.entitlements;
  const headline = (() => {
    if (access.state === 'trial') return `${daysUntil(access.endsAt)} days left in your free trial`;
    if (access.state === 'restricted') return 'No active plan';
    if (access.source === 'complimentary') return `${currentPlan?.name} — complimentary`;
    return `${currentPlan?.name} plan`;
  })();
  const detail = (() => {
    if (access.state === 'trial' && live && billing.plan && billing.interval) {
      return `You have everything in Professional until ${date(access.endsAt)}. Then ${PLANS[billing.plan].name} (${billing.interval}) starts and your first payment of ${formatInr(PLANS[billing.plan].price[billing.interval])} is taken.`;
    }
    if (access.state === 'trial') return `You have everything in Professional until ${date(access.endsAt)}. Choose a plan below to continue after that; your first payment is taken when the trial ends.`;
    if (access.source === 'complimentary') return `Provided by the platform team until ${date(access.endsAt)}.`;
    if (access.state === 'restricted') return 'Your website is still online. Choose a plan to publish new listings, invite people and connect domains again.';
    if (access.state === 'past_due') return 'Your last payment didn’t go through. Razorpay is retrying automatically, and everything keeps working meanwhile.';
    if (access.state === 'grace') return `Payments failed repeatedly, so the subscription is on hold. Adding listings, people and domains pauses on ${date(access.endsAt)}. Cancel and subscribe again to use a different card or UPI account.`;
    if (billing.cancelAtPeriodEnd) return `Cancelled — your plan stays active until ${date(billing.paidThrough)}. You won’t be charged again.`;
    if (billing.scheduledPlan) return `Moves to ${PLANS[billing.scheduledPlan].name} (${billing.scheduledInterval}) on ${date(billing.paidThrough)}.`;
    if (billing.status === 'cancelled') return `Your subscription has ended. Access continues until ${date(billing.paidThrough)}.`;
    return `${formatInr(PLANS[billing.plan ?? access.plan!].price[billing.interval ?? 'monthly'])} per ${billing.interval === 'yearly' ? 'year' : 'month'}, renewing on ${date(billing.paidThrough)}.`;
  })();

  return (
    <div className="space-y-6">
      {mode === 'test' && (
        <Notice tone="info">
          <strong className="font-semibold">Test mode.</strong> Razorpay isn’t connected on this server, so payments are simulated and no money moves. Add your Razorpay keys to take real payments.
        </Notice>
      )}
      {mode === 'off' && <Notice tone="info">Online payments aren’t set up on this platform yet. Please contact the platform team to change your plan.</Notice>}
      {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section aria-labelledby="current-plan" className="relative overflow-hidden rounded-[14px] bg-primary p-6 text-inverse sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border border-accent/30" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-12 size-44 rounded-full border border-accent/20" />
          <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATE_LABEL[access.state].tone)}>{STATE_LABEL[access.state].text}</span>
          <h2 id="current-plan" className="mt-4 font-heading text-[1.9rem] font-bold leading-tight tracking-tight">{headline}</h2>
          <p className="mt-2 max-w-xl text-white/75">{detail}</p>
          {(live || billing.scheduledPlan) && mode !== 'off' && (
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              {billing.scheduledPlan && <button type="button" onClick={keepCurrent} disabled={busy === 'keep'} className="font-semibold text-accent underline underline-offset-4 hover:text-ivory">Keep {billing.plan ? PLANS[billing.plan].name : 'current plan'} instead</button>}
              {live && !billing.cancelAtPeriodEnd && <button type="button" onClick={askCancel} className="text-white/70 underline underline-offset-4 hover:text-white">Cancel subscription</button>}
            </div>
          )}
        </section>

        <section aria-labelledby="usage" className="rounded-[14px] border border-line bg-white p-6">
          <h2 id="usage" className="font-heading font-semibold">What you’re using</h2>
          <div className="mt-5 space-y-5">
            <Meter label="Live listings" used={usage.listings} limit={ent.listings} paused={access.state === 'restricted'} />
            <Meter label="Team members and invitations" used={usage.seats} limit={ent.seats} paused={access.state === 'restricted'} />
            <Meter label="Custom domains" used={usage.customDomains} limit={ent.customDomains} paused={access.state === 'restricted'} />
          </div>
          {access.state === 'restricted' && <p className="mt-5 text-sm text-muted">Nothing is removed while you’re without a plan — you just can’t add more.</p>}
        </section>
      </div>

      <section aria-labelledby="plans">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="plans" className="font-heading text-lg font-semibold">Plans</h2>
            <p className="text-sm text-muted">Prices include 18% GST. Pay monthly, or yearly and get two months free.</p>
          </div>
          <div role="radiogroup" aria-label="Billing period" className="inline-flex rounded-lg border border-line bg-white p-1">
            {(['monthly', 'yearly'] as const).map((i) => (
              <button key={i} type="button" role="radio" aria-checked={interval === i} onClick={() => setBillingInterval(i)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', interval === i ? 'bg-primary text-inverse' : 'text-muted hover:text-ink')}>
                {i === 'monthly' ? 'Monthly' : 'Yearly'}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {PLAN_CODES.map((code) => {
            const p = PLANS[code];
            const isCurrent = live && billing.plan === code && billing.interval === interval;
            const isScheduled = billing.scheduledPlan === code && billing.scheduledInterval === interval;
            const blocked = live && (billing.status === 'pending' || billing.status === 'halted');
            const label = (() => {
              if (isCurrent) return 'Your current plan';
              if (isScheduled) return 'Starts at renewal';
              if (!live) return `Choose ${p.name}`;
              if (billing.status === 'authenticated') return `Switch to ${p.name}`;
              return isUpgrade({ plan: billing.plan!, interval: billing.interval! }, { plan: code, interval }) ? `Upgrade to ${p.name}` : `Switch to ${p.name}`;
            })();
            const monthlyEquivalent = interval === 'yearly' ? Math.round(p.price.yearly / 12 / 100) * 100 : null;
            return (
              <article key={code} className={cn('flex flex-col rounded-[14px] border bg-white p-6', isCurrent ? 'border-primary ring-1 ring-primary' : 'border-line')}>
                <h3 className="font-heading text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 min-h-10 text-sm text-muted">{p.tagline}</p>
                <p className="mt-5"><span className="font-heading text-[2rem] font-bold tracking-tight tabular-nums">{formatInr(p.price[interval])}</span><span className="text-muted"> / {interval === 'yearly' ? 'year' : 'month'}</span></p>
                <p className="h-5 text-sm text-muted">{monthlyEquivalent ? `About ${formatInr(monthlyEquivalent)} a month` : ''}</p>
                <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                  {featureRows(p.entitlements).map(([ok, text]) => (
                    <li key={text} className={cn('flex gap-2.5', !ok && 'text-muted')}>
                      {ok ? <Check className="mt-0.5 size-4 shrink-0 text-[var(--color-success)]" aria-hidden="true" /> : <Minus className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                      <span>{ok ? text : <><span className="sr-only">Not included: </span>{text}</>}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={isCurrent || isScheduled || blocked || mode === 'off' || busy !== null}
                  onClick={() => askChange(code)}
                  className={cn('btn mt-6 min-h-11 w-full disabled:cursor-not-allowed', isCurrent || isScheduled ? 'btn-ghost opacity-70' : 'btn-primary disabled:opacity-50')}
                >
                  {busy === code ? 'Opening…' : label}
                </button>
              </article>
            );
          })}
        </div>
        <p className="mt-3 text-sm text-muted">Every plan includes the website editor, CRM, unlimited drafts and unlimited enquiries. Payments are handled by Razorpay (cards, UPI AutoPay, net banking).</p>
      </section>

      {mode === 'test' && live && data.subscriptionId && (
        <section aria-labelledby="test-tools" className="rounded-[14px] border border-dashed border-line bg-white p-5">
          <h2 id="test-tools" className="font-heading font-semibold">Try what happens at renewal</h2>
          <p className="mt-1 text-sm text-muted">Test mode only. Plays Razorpay’s part for the next billing date, through the same signed webhooks as real payments.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={busy !== null} onClick={() => simulate('success', data.subscriptionId!, false)} className="btn btn-ghost min-h-9 px-4 text-sm">Renewal succeeds</button>
            <button type="button" disabled={busy !== null} onClick={() => simulate('failure', data.subscriptionId!, false)} className="btn btn-ghost min-h-9 px-4 text-sm">Renewal fails</button>
          </div>
        </section>
      )}

      <section aria-labelledby="history" className="rounded-[14px] border border-line bg-white">
        <h2 id="history" className="border-b border-line px-5 py-4 font-heading font-semibold">Payment history</h2>
        {data.payments.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted">No payments yet. Receipts appear here after each charge.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Date</th>
                  <th scope="col" className="px-3 py-3 font-medium">Description</th>
                  <th scope="col" className="px-3 py-3 font-medium">Method</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Amount</th>
                  <th scope="col" className="px-5 py-3 font-medium"><span className="sr-only">Invoice</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-5 py-3">{shortDate(p.createdAt)}</td>
                    <td className="px-3 py-3">
                      <p>{p.plan ? `${PLANS[p.plan].name}, ${p.interval}` : 'Subscription'}</p>
                      {p.status === 'failed'
                        ? <p className="text-[var(--color-error)]">Failed — {p.failureReason}</p>
                        : p.periodStart && <p className="text-muted">{shortDate(p.periodStart)} – {shortDate(p.periodEnd)}</p>}
                    </td>
                    <td className="px-3 py-3 uppercase text-muted">{p.method ?? '—'}</td>
                    <td className={cn('px-3 py-3 text-right tabular-nums', p.status === 'failed' && 'text-muted line-through')}>{formatInr(p.amount)}</td>
                    <td className="px-5 py-3 text-right">
                      {p.invoiceUrl ? <a href={p.invoiceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 font-medium underline decoration-accent underline-offset-4"><ReceiptText className="size-4" aria-hidden="true" />Invoice</a> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Confirmation for plan changes and cancellation */}
      <Dialog.Root open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-lift outline-none">
            <div className="flex items-start justify-between gap-4">
              <Dialog.Title className="font-heading text-lg font-semibold">{confirm?.title}</Dialog.Title>
              <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
            </div>
            <Dialog.Description className="mt-2 text-sm text-muted">{confirm?.body}</Dialog.Description>
            {confirm?.withReason && (
              <>
                <label htmlFor="cancel-reason" className="mt-4 block text-sm font-medium">What made you cancel? <span className="font-normal text-muted">(optional)</span></label>
                <textarea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} className="field mt-1.5" />
              </>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Dialog.Close className="btn btn-ghost min-h-10">{confirm?.withReason ? 'Keep subscription' : 'Not now'}</Dialog.Close>
              <button
                type="button"
                disabled={busy === 'confirm'}
                onClick={async () => {
                  if (!confirm) return;
                  setBusy('confirm');
                  try {
                    await confirm.run();
                    setConfirm(null);
                  } catch (e) {
                    fail(e);
                    setConfirm(null);
                  } finally {
                    setBusy(null);
                  }
                }}
                className="btn btn-primary min-h-10"
              >
                {busy === 'confirm' ? 'Working…' : confirm?.action}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Test-mode stand-in for Razorpay Checkout */}
      <Dialog.Root open={!!sim} onOpenChange={(o) => !o && busy === null && setSim(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-lift outline-none">
            <div className="rounded-t-2xl border-b border-dashed border-line bg-ivory px-6 py-3 text-xs font-semibold text-ink/70">Test payment — no money moves</div>
            <div className="p-6">
              <Dialog.Title className="font-heading text-lg font-semibold">{sim ? `${PLANS[sim.plan].name} plan for ${businessName}` : ''}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {sim && (sim.firstChargeAt
                  ? `Authorise ${formatInr(sim.amount)} per ${sim.interval === 'yearly' ? 'year' : 'month'}. The first payment is taken on ${date(sim.firstChargeAt)}, when your trial ends.`
                  : `Pay ${formatInr(sim.amount)} now, then every ${sim.interval === 'yearly' ? 'year' : 'month'}.`)}
              </Dialog.Description>
              <p className="mt-5 font-heading text-[2rem] font-bold tabular-nums">{sim ? formatInr(sim.amount) : ''}</p>
              <div className="mt-6 grid gap-2">
                <button type="button" disabled={busy !== null} onClick={() => sim && simulate('success', sim.subscriptionId, true)} className="btn btn-primary min-h-11">{busy === 'sim-success' ? 'Approving…' : 'Approve test payment'}</button>
                <button type="button" disabled={busy !== null} onClick={() => sim && simulate('failure', sim.subscriptionId, false)} className="btn btn-ghost min-h-11">{busy === 'sim-failure' ? 'Declining…' : 'Decline test payment'}</button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
