import Link from 'next/link';
import { PLANS, type BillingSummary } from '@estatery/shared';
import { cn } from '@/lib/format';

const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '');
const days = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : 0);

/**
 * One line at the top of every Admin Panel page when the plan needs attention. Owners get the
 * action; everyone else is told who can fix it.
 */
export function BillingBanner({ summary, canManage }: { summary: BillingSummary; canManage: boolean }) {
  const { state, endsAt, plan, cancelAtPeriodEnd } = summary;
  let text: string | null = null;
  let urgent = false;
  if (state === 'restricted') {
    text = 'Your plan isn’t active. The website stays online, but new listings, invitations and domains are paused.';
    urgent = true;
  } else if (state === 'grace') {
    text = `Payments for your subscription failed. Adding listings, people and domains pauses on ${date(endsAt)}.`;
    urgent = true;
  } else if (state === 'past_due') {
    text = 'Your last subscription payment didn’t go through. Razorpay will retry automatically.';
  } else if (state === 'trial' && !summary.subscribed && days(endsAt) <= 5) {
    text = `Your free trial ends ${days(endsAt) === 0 ? 'today' : days(endsAt) === 1 ? 'tomorrow' : `in ${days(endsAt)} days`}.`;
  } else if (cancelAtPeriodEnd && plan && days(endsAt) <= 7) {
    text = `Your ${PLANS[plan].name} plan ends on ${date(endsAt)}.`;
  }
  if (!text) return null;
  return (
    <div role={urgent ? 'alert' : 'status'} className={cn('mb-6 flex flex-col gap-2 rounded-lg px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between', urgent ? 'bg-[var(--color-error)]/8 text-[var(--color-error)]' : 'bg-accent/15 text-ink')}>
      <p>{text}</p>
      {canManage
        ? <Link href="/admin/billing" className="shrink-0 font-semibold underline underline-offset-4">{state === 'trial' ? 'Choose a plan' : 'Go to billing'}</Link>
        : <p className="shrink-0 text-ink/70">The account owner can sort this out under Billing.</p>}
    </div>
  );
}
