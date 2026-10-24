import type { ReactNode } from 'react';
import Link from 'next/link';
import { LEAD_STATUSES, type LeadStatus, type PropertyStatus } from '@estatery/shared';
import { cn } from '@/lib/format';

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-[1.75rem] font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-[14px] border border-line bg-white', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          {title && <h2 className="font-heading text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const inner = (
    <>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-2 font-heading text-[2rem] font-bold leading-none tracking-tight">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </>
  );
  const cls = 'block rounded-[14px] border border-line bg-white p-5';
  return href ? <Link href={href} className={cn(cls, 'transition-colors hover:border-ink/40')}>{inner}</Link> : <div className={cls}>{inner}</div>;
}

const PROPERTY_TONE: Record<PropertyStatus, string> = {
  published: 'bg-[var(--color-success)]/12 text-[var(--color-success)]',
  draft: 'bg-line text-ink/75',
  sold: 'bg-ink text-white',
  rented: 'bg-ink/80 text-white',
  archived: 'bg-line/60 text-muted',
};
export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize', PROPERTY_TONE[status])}>{status}</span>;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New', contacted: 'Contacted', qualified: 'Qualified', 'site-visit': 'Site visit', negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
};
const LEAD_TONE: Record<LeadStatus, string> = {
  new: 'bg-accent/25 text-[color-mix(in_oklab,var(--color-accent)_45%,black)]',
  contacted: 'bg-sky-100 text-sky-900',
  qualified: 'bg-indigo-100 text-indigo-900',
  'site-visit': 'bg-violet-100 text-violet-900',
  negotiation: 'bg-amber-100 text-amber-900',
  won: 'bg-[var(--color-success)]/12 text-[var(--color-success)]',
  lost: 'bg-line text-muted',
};
export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <span className={cn('inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', LEAD_TONE[status])}>{LEAD_STATUS_LABELS[status]}</span>;
}
export { LEAD_STATUSES };

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-14 text-center">
      <p className="font-heading font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Forbidden({ message }: { message: string }) {
  return (
    <Panel>
      <div className="px-6 py-14 text-center">
        <h1 className="font-heading text-lg font-semibold">You don’t have access to this section</h1>
        <p className="mx-auto mt-1.5 max-w-md text-sm text-muted">{message} If you need it, ask your site owner to change your role.</p>
        <Link href="/admin" className="btn btn-ghost mt-5 min-h-10">Back to dashboard</Link>
      </div>
    </Panel>
  );
}

export function Pager({ page, totalPages, href }: { page: number; totalPages: number; href: (p: number) => string }) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 text-sm">
      <span className="text-muted">Page {page} of {totalPages}</span>
      <div className="flex gap-2">
        {page > 1 ? <Link href={href(page - 1)} className="btn btn-ghost min-h-9 px-3">Previous</Link> : <span className="btn btn-ghost min-h-9 px-3 opacity-40" aria-disabled="true">Previous</span>}
        {page < totalPages ? <Link href={href(page + 1)} className="btn btn-ghost min-h-9 px-3">Next</Link> : <span className="btn btn-ghost min-h-9 px-3 opacity-40" aria-disabled="true">Next</span>}
      </div>
    </nav>
  );
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso));
}
