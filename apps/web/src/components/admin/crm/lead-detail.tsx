'use client';

import { BellRing, Check, Mail, MessageCircle, Phone, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus, type SessionUser } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice } from '../fields';
import { relativeTime } from '../ui';
import { INTENT_LABELS, type LeadDetail as Detail } from './types';

const KINDS = [
  { id: 'note', label: 'Note' },
  { id: 'call', label: 'Call' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email', label: 'Email' },
  { id: 'meeting', label: 'Meeting' },
] as const;

const fmt = (iso: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(iso));

function describe(a: Detail['activity'][number]) {
  switch (a.type) {
    case 'created': return `Sent an enquiry from the website${a.meta.autoAssigned ? ` (auto-assigned to ${a.meta.autoAssigned})` : ''}`;
    case 'status': return `Moved from ${LEAD_STATUS_LABELS[a.meta.from as LeadStatus] ?? a.meta.from} to ${LEAD_STATUS_LABELS[a.meta.to as LeadStatus] ?? a.meta.to}`;
    case 'assigned': return a.meta.to ? `Assigned to ${a.meta.to}` : 'Unassigned';
    case 'reminder': return `Set a follow-up for ${a.meta.assignee || 'the team'} on ${fmt(String(a.meta.dueAt))}`;
    case 'reminder_done': return 'Completed a follow-up';
    case 'notified': return `Email notification sent to ${a.meta.recipients} ${a.meta.recipients === 1 ? 'person' : 'people'}`;
    case 'call': return 'Logged a call';
    case 'whatsapp': return 'Logged a WhatsApp conversation';
    case 'email': return 'Logged an email';
    case 'meeting': return 'Logged a meeting';
    default: return 'Added a note';
  }
}

function responseTime(from: string, to: string) {
  const m = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
  if (m < 60) return `${m} min`;
  if (m < 48 * 60) return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.round(m / 1440)} days`;
}

/** Tomorrow 10:00 local, as a datetime-local value. */
function tomorrowAt10() {
  const d = new Date(Date.now() + 86400_000);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

export function LeadDetail({ initial, user, businessName }: { initial: Detail; user: SessionUser; businessName: string }) {
  const router = useRouter();
  const [d, setD] = useState(initial);
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<(typeof KINDS)[number]['id']>('note');
  const [body, setBody] = useState('');
  const [lostReason, setLostReason] = useState('');
  const [pendingLost, setPendingLost] = useState(false);
  const [remNote, setRemNote] = useState('');
  const [remAt, setRemAt] = useState(tomorrowAt10);
  const [remWho, setRemWho] = useState('');

  const canWrite = user.permissions.includes('leads:write');
  const canAssign = user.permissions.includes('leads:assign');
  const canErase = user.permissions.includes('leads:delete');
  const l = d.lead;
  const phoneDigits = l.phone.replace(/[^\d]/g, '');
  const waNumber = phoneDigits.length === 10 ? `91${phoneDigits}` : phoneDigits; // assume India for 10-digit numbers
  const waText = encodeURIComponent(`Hi ${l.name.split(' ')[0]}, this is ${user.name.split(' ')[0]} from ${businessName}. Thanks for your enquiry${l.property ? ` about ${l.property.title}` : ''} — is now a good time to talk?`);

  async function run(key: string, path: string, method: string, payload?: unknown, success?: string) {
    setBusy(key);
    setNotice(null);
    try {
      const next = await adminRequest<Detail>(path, { method, body: payload });
      setD(next);
      if (success) setNotice({ tone: 'success', text: success });
      return true;
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'That didn’t save. Please try again.' });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function changeStage(next: LeadStatus) {
    if (next === 'lost') return setPendingLost(true);
    void run('status', `admin/leads/${l.id}/status`, 'POST', { status: next }, `Moved to ${LEAD_STATUS_LABELS[next]}.`);
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    if (await run('note', `admin/leads/${l.id}/notes`, 'POST', { body: body.trim(), kind })) setBody('');
  }

  async function addReminder(e: FormEvent) {
    e.preventDefault();
    if (!remNote.trim() || !remAt) return;
    const ok = await run('reminder', `admin/leads/${l.id}/reminders`, 'POST', { dueAt: new Date(remAt).toISOString(), note: remNote.trim(), assigneeUserId: remWho || null }, 'Follow-up scheduled. It will be emailed when it’s due.');
    if (ok) setRemNote('');
  }

  async function erase() {
    if (!window.confirm(`Permanently delete ${l.name}’s enquiry and its whole history? Use this when someone asks for their data to be removed. This can’t be undone.`)) return;
    setBusy('erase');
    try {
      await adminRequest(`admin/leads/${l.id}`, { method: 'DELETE' });
      router.replace('/admin/leads');
      router.refresh();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof AdminRequestError ? e.message : 'The lead wasn’t deleted.' });
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-6">
        {notice && <Notice tone={notice.tone} onDismiss={() => setNotice(null)}>{notice.text}</Notice>}

        <section className="rounded-[14px] border border-line bg-white p-5">
          <div className="flex flex-wrap gap-2">
            <a href={`tel:${l.phone.replace(/\s/g, '')}`} className="btn btn-primary min-h-10"><Phone className="size-4" aria-hidden="true" />Call {l.phone}</a>
            {waNumber.length >= 10 && <a href={`https://wa.me/${waNumber}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost min-h-10"><MessageCircle className="size-4" aria-hidden="true" />WhatsApp</a>}
            <a href={`mailto:${l.email}?subject=${encodeURIComponent(`Your enquiry with ${businessName}`)}`} className="btn btn-ghost min-h-10"><Mail className="size-4" aria-hidden="true" />Email</a>
          </div>
          <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ['Request', `${INTENT_LABELS[l.intent] ?? l.intent}${l.preferredDate ? ` · preferred visit ${new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(l.preferredDate))}` : ''}`],
              ['Listing', l.property ? <a key="p" href={`/properties/${l.property.slug}`} target="_blank" rel="noopener" className="underline decoration-accent underline-offset-4">{l.property.title}</a> : '—'],
              ['Budget', l.budget ?? '—'],
              ['Email', l.email],
              ['Source', l.source],
              ['Received', fmt(l.createdAt)],
              ['First contact', l.firstContactedAt ? `${fmt(l.firstContactedAt)} (${responseTime(l.createdAt, l.firstContactedAt)} after the enquiry)` : 'Not yet'],
              ...(l.lostReason ? [['Lost because', l.lostReason]] : []),
            ].map(([k, v]) => (
              <div key={String(k)}><dt className="text-muted">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
            ))}
          </dl>
          {l.message && <blockquote className="mt-5 rounded-lg bg-ivory px-4 py-3 text-sm">“{l.message}”</blockquote>}
        </section>

        <section className="rounded-[14px] border border-line bg-white" aria-labelledby="timeline-h">
          <h2 id="timeline-h" className="border-b border-line px-5 py-4 font-heading font-semibold">Timeline</h2>
          {canWrite && (
            <form onSubmit={addNote} className="border-b border-line p-5">
              <div role="radiogroup" aria-label="What are you logging?" className="mb-2 flex flex-wrap gap-1">
                {KINDS.map((k) => (
                  <button key={k.id} type="button" role="radio" aria-checked={kind === k.id} onClick={() => setKind(k.id)} className={cn('rounded-full px-3 py-1 text-sm', kind === k.id ? 'bg-primary text-inverse' : 'text-muted hover:bg-ivory')}>{k.label}</button>
                ))}
              </div>
              <label htmlFor="note-body" className="sr-only">Details</label>
              <textarea id="note-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={4000} placeholder={kind === 'note' ? 'Add an internal note — only your team sees this' : `What happened on the ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}?`} className="field" />
              <div className="mt-2 flex justify-end"><button type="submit" disabled={!body.trim() || busy === 'note'} className="btn btn-primary min-h-9 px-4 text-sm disabled:opacity-50">{busy === 'note' ? 'Saving…' : kind === 'note' ? 'Add note' : `Log ${KINDS.find((k) => k.id === kind)!.label.toLowerCase()}`}</button></div>
            </form>
          )}
          <ol className="divide-y divide-line">
            {d.activity.map((a) => (
              <li key={a.id} className="px-5 py-3.5">
                <p className="text-sm"><span className="font-medium">{a.actorName}</span> <span className="text-muted">{describe(a).charAt(0).toLowerCase() + describe(a).slice(1)}</span></p>
                {a.body && a.type !== 'created' && <p className="mt-1 whitespace-pre-line text-sm">{a.body}</p>}
                <p className="mt-0.5 text-xs text-muted" title={fmt(a.createdAt)}>{relativeTime(a.createdAt)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
        <section className="space-y-4 rounded-[14px] border border-line bg-white p-5">
          <div>
            <label htmlFor="stage" className="mb-1.5 block text-sm font-medium">Stage</label>
            <select id="stage" value={l.status} disabled={!canWrite || busy === 'status'} onChange={(e) => changeStage(e.target.value as LeadStatus)} className="field cursor-pointer">
              {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
            </select>
            {pendingLost && (
              <form className="mt-3 space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run('status', `admin/leads/${l.id}/status`, 'POST', { status: 'lost', note: lostReason }, 'Marked as lost.')) { setPendingLost(false); setLostReason(''); } }}>
                <label htmlFor="lost" className="text-sm font-medium">Why was it lost?</label>
                <input id="lost" autoFocus value={lostReason} onChange={(e) => setLostReason(e.target.value)} className="field" placeholder="e.g. Bought elsewhere" maxLength={1000} />
                <div className="flex gap-2"><button type="submit" disabled={lostReason.trim().length < 3} className="btn btn-primary min-h-9 px-3 text-sm disabled:opacity-50">Mark as lost</button><button type="button" onClick={() => setPendingLost(false)} className="btn btn-ghost min-h-9 px-3 text-sm">Cancel</button></div>
              </form>
            )}
          </div>
          <div>
            <label htmlFor="advisor" className="mb-1.5 block text-sm font-medium">Advisor</label>
            {canAssign ? (
              <select id="advisor" value={l.agentId ?? ''} disabled={busy === 'assign'} onChange={(e) => run('assign', `admin/leads/${l.id}/assign`, 'POST', { agentId: e.target.value || null }, e.target.value ? 'Assigned. They’ve been emailed.' : 'Unassigned.')} className="field cursor-pointer">
                <option value="">Unassigned</option>
                {d.assignableAgents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ) : (
              <p id="advisor" className="text-sm">{l.agent ?? 'Unassigned'}</p>
            )}
          </div>
        </section>

        <section className="rounded-[14px] border border-line bg-white" aria-labelledby="fu-h">
          <h2 id="fu-h" className="flex items-center gap-2 border-b border-line px-5 py-4 font-heading font-semibold"><BellRing className="size-4" aria-hidden="true" />Follow-ups</h2>
          <ul className="divide-y divide-line">
            {d.reminders.length === 0 && <li className="px-5 py-4 text-sm text-muted">No follow-ups scheduled.</li>}
            {d.reminders.map((r) => (
              <li key={r.id} className={cn('flex items-start gap-3 px-5 py-3', r.doneAt && 'opacity-60')}>
                <button
                  type="button" disabled={!canWrite || busy === r.id}
                  onClick={() => run(r.id, `admin/leads/reminders/${r.id}`, 'PATCH', { done: !r.doneAt })}
                  className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded border', r.doneAt ? 'border-primary bg-primary text-white' : 'border-line hover:border-ink')}
                  aria-label={r.doneAt ? `Mark “${r.note}” as not done` : `Mark “${r.note}” as done`} aria-pressed={!!r.doneAt}
                >
                  {r.doneAt && <Check className="size-3.5" aria-hidden="true" />}
                </button>
                <div className="min-w-0 text-sm">
                  <p className={cn(r.doneAt && 'line-through')}>{r.note}</p>
                  <p className={cn('text-xs', r.overdue ? 'font-semibold text-[var(--color-error)]' : 'text-muted')}>{r.overdue ? 'Overdue · ' : ''}{fmt(r.dueAt)} · {r.assignee}</p>
                </div>
              </li>
            ))}
          </ul>
          {canWrite && (
            <form onSubmit={addReminder} className="space-y-3 border-t border-line p-5">
              <div>
                <label htmlFor="rem-note" className="mb-1 block text-sm font-medium">Follow up on</label>
                <input id="rem-note" value={remNote} onChange={(e) => setRemNote(e.target.value)} maxLength={500} placeholder="e.g. Share floor plans" className="field" />
              </div>
              <div>
                <label htmlFor="rem-at" className="mb-1 block text-sm font-medium">When</label>
                <input id="rem-at" type="datetime-local" value={remAt} onChange={(e) => setRemAt(e.target.value)} className="field" />
              </div>
              {d.teammates.length > 1 && (
                <div>
                  <label htmlFor="rem-who" className="mb-1 block text-sm font-medium">For</label>
                  <select id="rem-who" value={remWho} onChange={(e) => setRemWho(e.target.value)} className="field cursor-pointer">
                    <option value="">The assigned advisor (or me)</option>
                    {d.teammates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <button type="submit" disabled={!remNote.trim() || busy === 'reminder'} className="btn btn-ghost min-h-9 w-full text-sm disabled:opacity-50">{busy === 'reminder' ? 'Scheduling…' : 'Schedule follow-up'}</button>
            </form>
          )}
        </section>

        {canErase && (
          <section className="rounded-[14px] border border-line bg-white p-5 text-sm">
            <h2 className="font-heading font-semibold">Privacy</h2>
            <p className="mt-1 text-muted">If {l.name.split(' ')[0]} asks you to delete their data, remove the enquiry and its entire history here.</p>
            <button type="button" onClick={erase} disabled={busy === 'erase'} className="mt-3 inline-flex items-center gap-2 font-medium text-[var(--color-error)] hover:underline"><Trash2 className="size-4" aria-hidden="true" />{busy === 'erase' ? 'Deleting…' : 'Delete lead permanently'}</button>
          </section>
        )}
        <Link href="/admin/leads" className="block text-sm text-muted hover:text-ink">← Back to leads</Link>
      </aside>
    </div>
  );
}
