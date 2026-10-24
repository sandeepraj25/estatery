'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatInr, PLAN_CODES, PLANS, type AccessState, type PlanCode } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';

export interface TenantRow {
  id: string; slug: string; name: string; status: 'trial' | 'active' | 'suspended'; createdAt: string;
  domains: Array<{ hostname: string; kind: string; verified: boolean; isPrimary: boolean }>;
  publishedListings: number; leads30d: number; activeUsers: number;
  billing: {
    state: AccessState; plan: PlanCode | null; source: 'trial' | 'subscription' | 'complimentary' | null; endsAt: string | null;
    status: string; interval: string | null; compPlan: PlanCode | null; compUntil: string | null; trialEndsAt: string | null; nextPlan: PlanCode | null;
    lastPayment: { amount: number; at: string | null } | null;
  } | null;
}

const STATE: Record<AccessState, { label: string; tone: string }> = {
  trial: { label: 'Trial', tone: 'bg-accent/25 text-[color-mix(in_oklab,var(--color-accent)_40%,black)]' },
  active: { label: 'Paying', tone: 'bg-[var(--color-success)]/12 text-[var(--color-success)]' },
  past_due: { label: 'Payment due', tone: 'bg-amber-100 text-amber-900' },
  grace: { label: 'On hold', tone: 'bg-[var(--color-error)]/10 text-[var(--color-error)]' },
  restricted: { label: 'No plan', tone: 'bg-line text-muted' },
};
const shortDate = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)) : '');
const inDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

function PlanCell({ b }: { b: TenantRow['billing'] }) {
  if (!b) return <span className="text-muted">—</span>;
  const state = b.source === 'complimentary' ? { label: 'Complimentary', tone: 'bg-indigo-100 text-indigo-900' } : STATE[b.state];
  return (
    <div>
      <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', state.tone)}>{state.label}</span>
      <p className="mt-1">{b.plan ? PLANS[b.plan].name : '—'}{b.source === 'subscription' && b.interval ? `, ${b.interval}` : ''}</p>
      <p className="text-xs text-muted">
        {b.state === 'trial' ? `Ends ${shortDate(b.endsAt)}${b.nextPlan ? `, then ${PLANS[b.nextPlan].name}` : ''}` : b.source === 'complimentary' ? `Until ${shortDate(b.endsAt)}` : b.lastPayment ? `Last paid ${formatInr(b.lastPayment.amount)} on ${shortDate(b.lastPayment.at)}` : ''}
      </p>
    </div>
  );
}

function ManagePlan({ tenant, onDone }: { tenant: TenantRow; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(14);
  const [plan, setPlan] = useState<PlanCode>('professional');
  const [until, setUntil] = useState(inDays(90));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const b = tenant.billing;

  async function act(body: Record<string, unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await adminRequest(`platform/tenants/${tenant.id}/billing`, { method: 'PATCH', body });
      setOpen(false);
      onDone(msg);
    } catch (e) {
      setError(e instanceof AdminRequestError ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className="btn btn-ghost min-h-9 px-3 text-sm">Plan</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-lift outline-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-heading text-lg font-semibold">{tenant.name}’s plan</Dialog.Title>
            <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-sm text-muted">Changes here never charge the agency. Paid subscriptions are managed by the agency’s owner.</Dialog.Description>
          {error && <p role="alert" className="mt-4 rounded-lg bg-[var(--color-error)]/8 px-3 py-2 text-sm text-[var(--color-error)]">{error}</p>}

          <form className="mt-5 space-y-2 border-t border-line pt-5" onSubmit={(e) => { e.preventDefault(); void act({ action: 'extend-trial', days }, `${tenant.name}’s trial was extended by ${days} days.`); }}>
            <h3 className="font-medium">Extend the free trial</h3>
            <p className="text-sm text-muted">{b?.trialEndsAt ? `Currently ${new Date(b.trialEndsAt).getTime() > Date.now() ? 'ends' : 'ended'} ${shortDate(b.trialEndsAt)}.` : ''}</p>
            <div className="flex gap-2">
              <label htmlFor={`days-${tenant.id}`} className="sr-only">Days</label>
              <select id={`days-${tenant.id}`} value={days} onChange={(e) => setDays(Number(e.target.value))} className="field h-10 min-h-10 cursor-pointer py-0">
                {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} more days</option>)}
              </select>
              <button type="submit" disabled={busy} className="btn btn-ghost min-h-10 shrink-0">Extend</button>
            </div>
          </form>

          <form className="mt-5 space-y-2 border-t border-line pt-5" onSubmit={(e) => { e.preventDefault(); void act({ action: 'grant', plan, until }, `${tenant.name} now has ${PLANS[plan].name} free until ${shortDate(until)}.`); }}>
            <h3 className="font-medium">Give a plan for free</h3>
            <p className="text-sm text-muted">For partners, pilots or goodwill. It overrides any trial or subscription until the date you choose.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <label htmlFor={`plan-${tenant.id}`} className="sr-only">Plan</label>
              <select id={`plan-${tenant.id}`} value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)} className="field h-10 min-h-10 cursor-pointer py-0">
                {PLAN_CODES.map((c) => <option key={c} value={c}>{PLANS[c].name}</option>)}
              </select>
              <label htmlFor={`until-${tenant.id}`} className="sr-only">Until</label>
              <input id={`until-${tenant.id}`} type="date" min={inDays(1)} value={until} onChange={(e) => setUntil(e.target.value)} className="field h-10 min-h-10" />
              <button type="submit" disabled={busy || !until} className="btn btn-primary min-h-10 sm:col-span-2">Give {PLANS[plan].name} until {shortDate(until)}</button>
            </div>
          </form>

          {b?.compPlan && (
            <div className="mt-5 border-t border-line pt-5">
              <button type="button" disabled={busy} onClick={() => act({ action: 'revoke-grant' }, `Removed ${tenant.name}’s free plan.`)} className="text-sm font-medium text-[var(--color-error)] hover:underline">
                Remove the free {PLANS[b.compPlan].name} plan
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function PlatformTable({ tenants, currentTenantId }: { tenants: TenantRow[]; currentTenantId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function toggle(t: TenantRow) {
    const next = t.status === 'suspended' ? 'active' : 'suspended';
    if (next === 'suspended' && !window.confirm(`Suspend ${t.name}? Its public website and Admin Panel will go offline until you re-activate it.`)) return;
    setBusy(t.id);
    setError(null);
    try {
      await adminRequest(`platform/tenants/${t.id}/status`, { method: 'PATCH', body: { status: next } });
      router.refresh();
    } catch (e) {
      setError(e instanceof AdminRequestError ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {error && <p className="m-4 rounded-lg bg-[var(--color-error)]/8 px-4 py-3 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
      {done && <p className="m-4 rounded-lg bg-[var(--color-success)]/10 px-4 py-3 text-sm text-[var(--color-success)]" role="status">{done}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-left text-sm">
          <thead className="border-b border-line text-xs text-muted">
            <tr>
              <th scope="col" className="px-5 py-3 font-medium">Agency</th>
              <th scope="col" className="px-3 py-3 font-medium">Domains</th>
              <th scope="col" className="px-3 py-3 font-medium">Plan</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Live listings</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Leads (30d)</th>
              <th scope="col" className="px-3 py-3 text-right font-medium">Users</th>
              <th scope="col" className="px-3 py-3 font-medium">Site</th>
              <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {tenants.map((t) => (
              <tr key={t.id} className="align-top">
                <td className="px-5 py-3"><p className="font-medium">{t.name}</p><p className="text-muted">{t.slug}</p></td>
                <td className="px-3 py-3">
                  <ul className="space-y-0.5">
                    {t.domains.map((d) => (
                      <li key={d.hostname} className="font-mono text-xs">{d.hostname}{!d.verified && <span className="ml-1.5 font-sans text-[var(--color-error)]">unverified</span>}</li>
                    ))}
                  </ul>
                </td>
                <td className="px-3 py-3"><PlanCell b={t.billing} /></td>
                <td className="px-3 py-3 text-right font-heading font-semibold">{t.publishedListings}</td>
                <td className="px-3 py-3 text-right font-heading font-semibold">{t.leads30d}</td>
                <td className="px-3 py-3 text-right font-heading font-semibold">{t.activeUsers}</td>
                <td className="px-3 py-3">
                  <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', t.status === 'suspended' ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-[var(--color-success)]/12 text-[var(--color-success)]')}>{t.status === 'suspended' ? 'Suspended' : 'Online'}</span>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <ManagePlan tenant={t} onDone={(m) => { setDone(m); router.refresh(); }} />
                    {t.id === currentTenantId ? (
                      <span className="self-center text-xs text-muted">Signed in here</span>
                    ) : (
                      <button type="button" disabled={busy === t.id} onClick={() => toggle(t)} className={cn('btn min-h-9 px-3 text-sm', t.status === 'suspended' ? 'btn-ghost' : 'text-[var(--color-error)] hover:bg-[var(--color-error)]/8')}>
                        {busy === t.id ? 'Saving…' : t.status === 'suspended' ? 'Re-activate' : 'Suspend'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
