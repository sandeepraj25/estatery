'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, UserPlus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { assignableRoles, ROLE_DESCRIPTIONS, ROLE_LABELS, TENANT_ROLES, type SessionUser, type TenantRole } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { EmptyState, Panel, relativeTime } from './ui';

export interface TeamData {
  members: Array<{ id: string; name: string; email: string; role: TenantRole; status: 'active' | 'deactivated'; agentId: string | null; agentName: string | null; lastLoginAt: string | null; joinedAt: string }>;
  invites: Array<{ id: string; email: string; role: TenantRole; expiresAt: string }>;
  agents: Array<{ id: string; name: string; title: string }>;
}

function useAction() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  async function run(key: string, fn: () => Promise<unknown>) {
    setError(null);
    setBusy(key);
    try {
      await fn();
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof AdminRequestError ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(null);
    }
  }
  return { run, error, busy, clearError: () => setError(null) };
}

function InviteDialog({ actor }: { actor: SessionUser }) {
  const router = useRouter();
  const id = useId();
  const roles = assignableRoles(actor.role);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TenantRole>('agent');
  const [result, setResult] = useState<{ inviteUrl: string; emailed: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);

  function reset(next: boolean) {
    setOpen(next);
    if (!next) {
      setEmail('');
      setRole('agent');
      setResult(null);
      setError(null);
      setFieldError(null);
      setCopied(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldError(null);
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setFieldError('Enter a valid email');
    setSending(true);
    try {
      const r = await adminRequest<{ inviteUrl: string; emailed: boolean }>('admin/team/invites', { method: 'POST', body: { email: email.trim(), role } });
      setResult(r);
      router.refresh();
    } catch (err) {
      setError(err instanceof AdminRequestError ? err.message : 'The invitation wasn’t sent. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger className="btn btn-primary min-h-10"><UserPlus className="size-4" aria-hidden="true" />Invite teammate</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] max-h-[90dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl bg-white p-6 shadow-lift outline-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="font-heading text-xl font-semibold">{result ? 'Invitation ready' : 'Invite a teammate'}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {result ? (result.emailed ? `We emailed ${email}. You can also share the link directly.` : 'Email isn’t set up for this site yet, so share this link with them directly.') : 'They’ll get a link to set a password and join with the role you choose.'}
              </Dialog.Description>
            </div>
            <Dialog.Close className="grid size-9 shrink-0 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
          </div>

          {result ? (
            <div className="mt-6">
              <label htmlFor={`${id}-link`} className="mb-1.5 block text-sm font-medium">Invitation link (valid 7 days, single use)</label>
              <div className="flex gap-2">
                <input id={`${id}-link`} readOnly value={result.inviteUrl} className="field font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-ghost min-h-12 shrink-0" onClick={async () => { await navigator.clipboard.writeText(result.inviteUrl).catch(() => undefined); setCopied(true); }}>
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="btn btn-ghost min-h-10" onClick={() => { setResult(null); setEmail(''); setCopied(false); }}>Invite someone else</button>
                <Dialog.Close className="btn btn-primary min-h-10">Done</Dialog.Close>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-6 space-y-5">
              {error && <p className="rounded-lg bg-[var(--color-error)]/8 px-4 py-3 text-sm text-[var(--color-error)]" role="alert">{error}</p>}
              <div>
                <label htmlFor={`${id}-email`} className="mb-1.5 block text-sm font-medium">Email</label>
                <input id={`${id}-email`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field" aria-invalid={!!fieldError} autoComplete="off" />
                {fieldError && <p className="mt-1.5 text-sm text-[var(--color-error)]" role="alert">{fieldError}</p>}
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Role</legend>
                <div className="space-y-2">
                  {roles.map((r) => (
                    <label key={r} className={cn('flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors', role === r ? 'border-primary bg-ivory' : 'border-line hover:border-ink/40')}>
                      <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 accent-[var(--color-primary)]" />
                      <span>
                        <span className="block text-sm font-semibold">{ROLE_LABELS[r]}</span>
                        <span className="block text-sm text-muted">{ROLE_DESCRIPTIONS[r]}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex justify-end gap-2">
                <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
                <button type="submit" disabled={sending} className="btn btn-primary min-h-10 disabled:opacity-70">{sending ? 'Sending…' : 'Send invitation'}</button>
              </div>
            </form>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function TeamManager({ data, actor }: { data: TeamData; actor: SessionUser }) {
  const canManage = actor.permissions.includes('team:manage');
  const roles = assignableRoles(actor.role);
  const { run, error, busy, clearError } = useAction();

  const editable = (m: TeamData['members'][number]) =>
    canManage && m.id !== actor.membershipId && (m.role !== 'owner' || actor.role === 'owner');

  return (
    <>
      <div className="mb-6 flex justify-end">{canManage && <InviteDialog actor={actor} />}</div>
      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg bg-[var(--color-error)]/8 px-4 py-3 text-sm text-[var(--color-error)]" role="alert">
          {error}
          <button type="button" onClick={clearError} aria-label="Dismiss" className="shrink-0"><X className="size-4" /></button>
        </div>
      )}

      <Panel title={`Members (${data.members.filter((m) => m.status === 'active').length} active)`}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-3 font-medium">Person</th>
                <th scope="col" className="px-3 py-3 font-medium">Role</th>
                <th scope="col" className="px-3 py-3 font-medium">Advisor profile</th>
                <th scope="col" className="px-3 py-3 font-medium">Last sign-in</th>
                <th scope="col" className="px-5 py-3 text-right font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.members.map((m) => {
                const can = editable(m);
                const inactive = m.status === 'deactivated';
                return (
                  <tr key={m.id} className={inactive ? 'bg-ivory/40 text-muted' : ''}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{m.name}{m.id === actor.membershipId && <span className="ml-2 text-xs font-normal text-muted">(you)</span>}</p>
                      <p className="text-muted">{m.email}</p>
                    </td>
                    <td className="px-3 py-3">
                      {can && !inactive ? (
                        <>
                          <label htmlFor={`role-${m.id}`} className="sr-only">Role for {m.name}</label>
                          <select
                            id={`role-${m.id}`}
                            value={m.role}
                            disabled={busy === m.id}
                            onChange={(e) => run(m.id, () => adminRequest(`admin/team/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }))}
                            className="field h-9 min-h-9 w-44 cursor-pointer py-0 text-sm"
                          >
                            {TENANT_ROLES.filter((r) => roles.includes(r) || r === m.role).map((r) => <option key={r} value={r} disabled={!roles.includes(r)}>{ROLE_LABELS[r]}</option>)}
                          </select>
                        </>
                      ) : (
                        <span>{ROLE_LABELS[m.role]}{inactive && ' · Deactivated'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {m.role === 'agent' && canManage && !inactive ? (
                        <>
                          <label htmlFor={`agent-${m.id}`} className="sr-only">Advisor profile for {m.name}</label>
                          <select
                            id={`agent-${m.id}`}
                            value={m.agentId ?? ''}
                            disabled={busy === m.id}
                            onChange={(e) => run(m.id, () => adminRequest(`admin/team/members/${m.id}`, { method: 'PATCH', body: { agentId: e.target.value || null } }))}
                            className="field h-9 min-h-9 w-48 cursor-pointer py-0 text-sm"
                          >
                            <option value="">Not linked</option>
                            {data.agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </>
                      ) : (
                        <span className="text-muted">{m.agentName ?? '—'}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-muted">{m.lastLoginAt ? relativeTime(m.lastLoginAt) : 'Never'}</td>
                    <td className="px-5 py-3 text-right">
                      {can && (
                        <button
                          type="button"
                          disabled={busy === m.id}
                          onClick={() => {
                            if (!inactive && !window.confirm(`Remove ${m.name}’s access? They’ll be signed out immediately. You can restore access later.`)) return;
                            run(m.id, () => adminRequest(`admin/team/members/${m.id}`, { method: 'PATCH', body: { status: inactive ? 'active' : 'deactivated' } }));
                          }}
                          className={cn('btn min-h-9 px-3 text-sm', inactive ? 'btn-ghost' : 'text-[var(--color-error)] hover:bg-[var(--color-error)]/8')}
                        >
                          {busy === m.id ? 'Saving…' : inactive ? 'Restore access' : 'Remove access'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Pending invitations" className="mt-6">
        {data.invites.length === 0 ? (
          <EmptyState title="No pending invitations" body={canManage ? 'Invite agents, editors and managers so everyone signs in with their own account.' : undefined} />
        ) : (
          <ul className="divide-y divide-line">
            {data.invites.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-sm">
                <div>
                  <p className="font-medium">{i.email}</p>
                  <p className="text-muted">{ROLE_LABELS[i.role]} · expires {new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(i.expiresAt))}</p>
                </div>
                {canManage && (
                  <button type="button" disabled={busy === i.id} onClick={() => run(i.id, () => adminRequest(`admin/team/invites/${i.id}`, { method: 'DELETE' }))} className="btn btn-ghost min-h-9 px-3 text-sm">
                    {busy === i.id ? 'Cancelling…' : 'Cancel invitation'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="What each role can do" className="mt-6">
        <dl className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-3">
          {TENANT_ROLES.map((r) => (
            <div key={r} className="bg-white px-5 py-4">
              <dt className="text-sm font-semibold">{ROLE_LABELS[r]}</dt>
              <dd className="mt-1 text-sm text-muted">{ROLE_DESCRIPTIONS[r]}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}
