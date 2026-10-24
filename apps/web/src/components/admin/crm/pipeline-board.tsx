'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { DndContext, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { BellRing, GripVertical, X } from 'lucide-react';
import Link from 'next/link';
import { useId, useState } from 'react';
import { LEAD_STATUS_LABELS, LEAD_STATUSES, type LeadStatus } from '@estatery/shared';
import { AdminRequestError, adminRequest } from '@/lib/admin-client';
import { cn } from '@/lib/format';
import { Notice } from '../fields';
import { relativeTime } from '../ui';
import { INTENT_LABELS, type BoardData, type LeadRow } from './types';

function Card({ lead, canWrite, onMove }: { lead: LeadRow; canWrite: boolean; onMove: (to: LeadStatus) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, data: { from: lead.status }, disabled: !canWrite });
  const overdue = lead.nextReminderAt && new Date(lead.nextReminderAt).getTime() < Date.now();
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), zIndex: isDragging ? 20 : undefined }} className={cn('rounded-xl border border-line bg-white p-3 shadow-sm', isDragging && 'shadow-lift ring-2 ring-accent')}>
      <div className="relative">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/admin/leads/${lead.id}`} className="block font-medium hover:underline">{lead.name}</Link>
          {canWrite && (
            <button type="button" {...listeners} {...attributes} aria-roledescription="draggable lead" aria-label={`Drag ${lead.name} to another stage`} className="-mr-1 -mt-0.5 grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-muted hover:bg-ivory active:cursor-grabbing">
              <GripVertical className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-muted">{INTENT_LABELS[lead.intent] ?? lead.intent}{lead.property ? ` · ${lead.property.title}` : lead.budget ? ` · ${lead.budget}` : ''}</p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          <span className="truncate">{lead.agent ?? <span className="font-medium text-[color-mix(in_oklab,var(--color-accent)_45%,black)]">Unassigned</span>}</span>
          <span className="shrink-0">{relativeTime(lead.createdAt)}</span>
        </div>
        {lead.nextReminderAt && (
          <p className={cn('mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', overdue ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]' : 'bg-ivory text-ink/80')}>
            <BellRing className="size-3" aria-hidden="true" />{overdue ? 'Follow-up overdue' : `Follow up ${new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(lead.nextReminderAt))}`}
          </p>
        )}
      </div>
      {canWrite && (
        <>
          <label htmlFor={`move-${lead.id}`} className="sr-only">Move {lead.name} to stage</label>
          <select id={`move-${lead.id}`} value={lead.status} onChange={(e) => onMove(e.target.value as LeadStatus)} className="mt-2 h-8 w-full cursor-pointer rounded-md border border-line bg-ivory/50 px-2 text-xs">
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
          </select>
        </>
      )}
    </li>
  );
}

function Column({ status, label, total, children }: { status: string; label: string; total: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section ref={setNodeRef} aria-label={`${label}: ${total}`} className={cn('flex w-72 shrink-0 flex-col rounded-[14px] bg-[color-mix(in_oklab,var(--color-border)_45%,white)] p-2 transition-colors', isOver && 'bg-accent/20 ring-2 ring-accent')}>
      <h2 className="flex items-center justify-between px-2 py-2 text-sm font-semibold">{label}<span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted">{total}</span></h2>
      {children}
    </section>
  );
}

/** Drag cards between stages, or use each card's stage menu (keyboard and screen-reader friendly). */
export function PipelineBoard({ initial, canWrite }: { initial: BoardData; canWrite: boolean }) {
  const [board, setBoard] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [lostFor, setLostFor] = useState<LeadRow | null>(null);
  const [reason, setReason] = useState('');
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const findLead = (id: string) => board.columns.flatMap((c) => c.items).find((l) => l.id === id);

  async function move(lead: LeadRow, to: LeadStatus, note = '') {
    if (lead.status === to) return;
    if (to === 'lost' && !note) {
      setLostFor(lead);
      setReason('');
      return;
    }
    const before = board;
    // Optimistic: move the card now, roll back if the API refuses.
    setBoard((b) => ({
      ...b,
      columns: b.columns.map((c) => {
        if (c.status === lead.status) return { ...c, total: c.total - 1, items: c.items.filter((i) => i.id !== lead.id) };
        if (c.status === to) return { ...c, total: c.total + 1, items: [{ ...lead, status: to }, ...c.items] };
        return c;
      }),
      closed30d: to === 'won' ? { ...b.closed30d, won: b.closed30d.won + 1 } : to === 'lost' ? { ...b.closed30d, lost: b.closed30d.lost + 1 } : b.closed30d,
    }));
    setError(null);
    try {
      await adminRequest(`admin/leads/${lead.id}/status`, { method: 'POST', body: { status: to, note } });
    } catch (e) {
      setBoard(before);
      setError(e instanceof AdminRequestError ? e.message : `${lead.name} couldn’t be moved. Please try again.`);
    }
  }

  function onDragEnd(e: DragEndEvent) {
    const lead = findLead(String(e.active.id));
    if (lead && e.over) void move(lead, e.over.id as LeadStatus);
  }

  return (
    <>
      {error && <div className="mb-3"><Notice tone="error" onDismiss={() => setError(null)}>{error}</Notice></div>}
      <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {board.columns.map((c) => (
            <Column key={c.status} status={c.status} label={c.label} total={c.total}>
              <ul className="flex min-h-24 flex-col gap-2">
                {c.items.map((l) => <Card key={l.id} lead={l} canWrite={canWrite} onMove={(to) => move(l, to)} />)}
                {c.items.length === 0 && <li className="px-2 py-6 text-center text-xs text-muted">No leads at this stage</li>}
                {c.total > c.items.length && <li className="px-2 text-center text-xs text-muted"><Link href={`/admin/leads?view=list&status=${c.status}`} className="underline">See all {c.total}</Link></li>}
              </ul>
            </Column>
          ))}
          {(['won', 'lost'] as const).map((s) => (
            <Column key={s} status={s} label={`${LEAD_STATUS_LABELS[s]} (30 days)`} total={board.closed30d[s]}>
              <p className="px-2 py-6 text-center text-xs text-muted">Drop a lead here to mark it {s}. <Link href={`/admin/leads?view=list&status=${s}`} className="underline">View all</Link></p>
            </Column>
          ))}
        </div>
      </DndContext>

      <Dialog.Root open={!!lostFor} onOpenChange={(o) => !o && setLostFor(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[60] bg-primary/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[61] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-6 shadow-lift outline-none">
            <div className="flex items-start justify-between">
              <Dialog.Title className="font-heading text-lg font-semibold">Why was {lostFor?.name} lost?</Dialog.Title>
              <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-ivory" aria-label="Close"><X className="size-5" /></Dialog.Close>
            </div>
            <Dialog.Description className="mt-1 text-sm text-muted">A short reason helps you see why deals fall through.</Dialog.Description>
            <form onSubmit={(e) => { e.preventDefault(); if (lostFor && reason.trim().length >= 3) { void move(lostFor, 'lost', reason.trim()); setLostFor(null); } }}>
              <label htmlFor="lost-reason" className="mt-4 block text-sm font-medium">Reason</label>
              <input id="lost-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Budget too low for the area" className="field mt-1.5" maxLength={1000} />
              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close className="btn btn-ghost min-h-10">Cancel</Dialog.Close>
                <button type="submit" disabled={reason.trim().length < 3} className="btn btn-primary min-h-10 disabled:opacity-50">Mark as lost</button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
