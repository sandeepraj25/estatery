import Link from 'next/link';
import type { LeadStatus } from '@estatery/shared';
import { adminData, requireUser } from '@/lib/admin-api';
import { EmptyState, LeadStatusBadge, PageHeader, Panel, Stat, relativeTime } from '@/components/admin/ui';

export const metadata = { title: 'Dashboard' };

interface LeadRow { id: string; name: string; intent: string; status: LeadStatus; preferredDate: string | null; property: { title: string; slug: string } | null; createdAt: string }
interface Dashboard {
  inventory: Record<'draft' | 'published' | 'sold' | 'rented' | 'archived', number>;
  featured: number;
  team: number | null;
  leads: { last30Days: number; awaitingContact: number; conversionRate: number | null; recent: LeadRow[]; upcomingVisits: LeadRow[] } | null;
  activity: Array<{ id: string; summary: string; actorName: string; createdAt: string }> | null;
}

const INTENT: Record<string, string> = { enquiry: 'Question', callback: 'Call back', 'site-visit': 'Site visit', general: 'Home search' };

export default async function DashboardPage() {
  const user = await requireUser();
  const [res, fu] = await Promise.all([
    adminData<Dashboard>('admin/dashboard'),
    adminData<{ items: Array<{ id: string; leadId: string; leadName: string; note: string; dueAt: string; overdue: boolean }> }>('admin/leads/reminders/mine'),
  ]);
  const followUps = fu.ok ? fu.data.items : null;
  if (!res.ok) return <p className="text-[var(--color-error)]">{res.message}</p>;
  const d = res.data;
  const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const live = d.inventory.published;

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(' ')[0]}`}
        description={d.leads?.awaitingContact ? `${d.leads.awaitingContact} new ${d.leads.awaitingContact === 1 ? 'enquiry is' : 'enquiries are'} waiting for a first call.` : 'Here’s how your site is doing.'}
        actions={<a href="/" target="_blank" rel="noopener" className="btn btn-ghost min-h-10 bg-white">View website</a>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live listings" value={live} hint={`${d.featured} featured · ${d.inventory.draft} in draft`} href="/admin/properties?status=published" />
        <Stat label="Sold or rented" value={d.inventory.sold + d.inventory.rented} hint={`${d.inventory.archived} archived`} href="/admin/properties?status=sold" />
        {d.leads ? (
          <>
            <Stat label="Enquiries, last 30 days" value={d.leads.last30Days} hint={`${d.leads.awaitingContact} awaiting contact`} href="/admin/leads" />
            <Stat label="Win rate" value={d.leads.conversionRate === null ? '—' : `${d.leads.conversionRate}%`} hint="Won out of closed enquiries" />
          </>
        ) : (
          d.team !== null && <Stat label="Team members" value={d.team} href="/admin/team" />
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        {d.leads && (
          <Panel title={user.permissions.includes('leads:read:all') ? 'Latest enquiries' : 'Your latest enquiries'} action={<Link href="/admin/leads" className="text-sm font-semibold underline decoration-accent underline-offset-4">See all</Link>}>
            {d.leads.recent.length === 0 ? (
              <EmptyState title="No enquiries yet" body="New enquiries from your website appear here the moment they’re submitted." />
            ) : (
              <ul className="divide-y divide-line">
                {d.leads.recent.map((l) => (
                  <li key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium"><Link href={`/admin/leads/${l.id}`} className="hover:underline">{l.name}</Link> <span className="font-normal text-muted">· {INTENT[l.intent] ?? l.intent}</span></p>
                      <p className="truncate text-sm text-muted">{l.property ? l.property.title : 'General enquiry'}</p>
                    </div>
                    <LeadStatusBadge status={l.status} />
                    <span className="hidden w-24 text-right text-sm text-muted sm:block">{relativeTime(l.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}

        <div className="space-y-6">
          {followUps && d.leads && (
            <Panel title="Your follow-ups" action={followUps.some((f) => f.overdue) ? <span className="text-sm font-semibold text-[var(--color-error)]">{followUps.filter((f) => f.overdue).length} overdue</span> : undefined}>
              {followUps.length === 0 ? (
                <EmptyState title="You’re all caught up" body="Follow-ups you schedule on a lead appear here, and you’re emailed when each one is due." />
              ) : (
                <ul className="divide-y divide-line">
                  {followUps.slice(0, 6).map((f) => (
                    <li key={f.id} className="px-5 py-3">
                      <Link href={`/admin/leads/${f.leadId}`} className="font-medium hover:underline">{f.leadName}</Link>
                      <p className="truncate text-sm">{f.note}</p>
                      <p className={f.overdue ? 'text-xs font-semibold text-[var(--color-error)]' : 'text-xs text-muted'}>
                        {f.overdue ? 'Overdue · ' : ''}{new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' }).format(new Date(f.dueAt))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {d.leads && (
            <Panel title="Upcoming site visits">
              {d.leads.upcomingVisits.length === 0 ? (
                <EmptyState title="No visits booked" body="Visits requested on property pages show up here by date." />
              ) : (
                <ul className="divide-y divide-line">
                  {d.leads.upcomingVisits.map((l) => (
                    <li key={l.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className="w-12 shrink-0 rounded-lg bg-ivory py-1.5 text-center">
                        <p className="text-[0.6875rem] font-semibold text-muted">{new Intl.DateTimeFormat('en-IN', { month: 'short' }).format(new Date(l.preferredDate!))}</p>
                        <p className="font-heading text-lg font-bold leading-none">{new Date(l.preferredDate!).getDate()}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.name}</p>
                        <p className="truncate text-sm text-muted">{l.property?.title ?? 'Viewing'}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
          {d.activity && (
            <Panel title="Recent activity" action={<Link href="/admin/activity" className="text-sm font-semibold underline decoration-accent underline-offset-4">Full log</Link>}>
              <ul className="divide-y divide-line">
                {d.activity.map((a) => (
                  <li key={a.id} className="px-5 py-3">
                    <p className="text-sm"><span className="font-medium">{a.actorName}</span> <span className="text-muted">{a.summary.charAt(0).toLowerCase() + a.summary.slice(1)}</span></p>
                    <p className="text-xs text-muted">{relativeTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
