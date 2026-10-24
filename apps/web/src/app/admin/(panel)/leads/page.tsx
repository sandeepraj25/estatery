import { BellRing, Download, LayoutGrid, List, Settings } from 'lucide-react';
import Link from 'next/link';
import { LEAD_INTENTS, LEAD_STATUS_LABELS, LEAD_STATUSES } from '@estatery/shared';
import { adminData, requireUser } from '@/lib/admin-api';
import { PipelineBoard } from '@/components/admin/crm/pipeline-board';
import { INTENT_LABELS, type BoardData, type LeadRow } from '@/components/admin/crm/types';
import { EmptyState, Forbidden, LeadStatusBadge, PageHeader, Pager, Panel, relativeTime } from '@/components/admin/ui';
import { cn } from '@/lib/format';

export const metadata = { title: 'Leads' };

interface ListResult { items: LeadRow[]; page: number; totalPages: number; total: number; scope: 'all' | 'own' | 'none' }

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const view = sp.view === 'list' || sp.status || sp.q || sp.intent || sp.from || sp.to ? 'list' : 'board';
  const all = user.permissions.includes('leads:read:all');
  const canWrite = user.permissions.includes('leads:write');

  const params = new URLSearchParams();
  for (const k of ['q', 'status', 'intent', 'agent', 'from', 'to', 'page'] as const) {
    const v = sp[k];
    if (!v) continue;
    if (k === 'status' && !(LEAD_STATUSES as readonly string[]).includes(v)) continue;
    if (k === 'intent' && !(LEAD_INTENTS as readonly string[]).includes(v)) continue;
    params.set(k, v.slice(0, 80));
  }
  const agentParam = all && params.get('agent') ? `?agent=${params.get('agent')}` : '';

  const [data, agents] = await Promise.all([
    view === 'board' ? adminData<BoardData>(`admin/leads/board${agentParam}`) : adminData<ListResult>(`admin/leads?${params}`),
    all ? adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/agents') : Promise.resolve(null),
  ]);
  if (!data.ok) return <Forbidden message={data.message} />;

  const tabHref = (v: 'board' | 'list') => {
    const n = new URLSearchParams(v === 'board' ? (params.get('agent') ? { agent: params.get('agent')! } : {}) : params);
    if (v === 'list') n.set('view', 'list');
    return `/admin/leads?${n}`;
  };
  const exportHref = `/api/admin/admin/leads/export.csv?${params}`;
  const result = data.data as ListResult;
  const board = data.data as BoardData;
  const scopeNote = !all ? 'Enquiries assigned to you.' : 'Every enquiry from your website, from first contact to closing.';

  return (
    <>
      <PageHeader
        title="Leads"
        description={scopeNote}
        actions={
          <>
            {user.permissions.includes('leads:export') && <a href={exportHref} className="btn btn-ghost min-h-10 bg-white"><Download className="size-4" aria-hidden="true" />Export CSV</a>}
            {user.permissions.includes('team:manage') && <Link href="/admin/leads/settings" className="btn btn-ghost min-h-10 bg-white"><Settings className="size-4" aria-hidden="true" />Notifications</Link>}
          </>
        }
      />
      {!all && !user.agentId && (
        <p className="mb-4 rounded-lg bg-accent/15 px-4 py-3 text-sm">Your login isn’t linked to an advisor profile yet, so no enquiries are assigned to you. Ask an administrator to link it on the Team page.</p>
      )}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="View" className="inline-flex rounded-lg border border-line bg-white p-1">
          {([['board', 'Pipeline', LayoutGrid], ['list', 'List', List]] as const).map(([v, label, Icon]) => (
            <Link key={v} href={tabHref(v)} aria-current={view === v ? 'page' : undefined} className={cn('inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium', view === v ? 'bg-primary text-inverse' : 'text-muted hover:text-ink')}>
              <Icon className="size-4" aria-hidden="true" />{label}
            </Link>
          ))}
        </nav>
        {all && agents?.ok && (
          <form className="flex items-center gap-2">
            {view === 'list' && <input type="hidden" name="view" value="list" />}
            {[...params].filter(([k]) => k !== 'agent' && k !== 'page').map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
            <label htmlFor="agent" className="text-sm text-muted">Advisor</label>
            <select id="agent" name="agent" defaultValue={params.get('agent') ?? ''} className="field h-10 min-h-10 w-48 cursor-pointer py-0 text-sm">
              <option value="">Everyone</option>
              <option value="unassigned">Unassigned</option>
              {agents.data.items.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <button className="btn btn-ghost min-h-10 bg-white px-3 text-sm">Apply</button>
          </form>
        )}
      </div>

      {view === 'board' ? (
        <PipelineBoard key={agentParam} initial={board} canWrite={canWrite} />
      ) : (
        <Panel>
          <form className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
            <input type="hidden" name="view" value="list" />
            {params.get('agent') && <input type="hidden" name="agent" value={params.get('agent')!} />}
            <div><label htmlFor="q" className="field-label mb-1 block">Search</label><input id="q" name="q" defaultValue={params.get('q') ?? ''} placeholder="Name, email or phone" className="field h-10 min-h-10" /></div>
            <div><label htmlFor="status" className="field-label mb-1 block">Stage</label>
              <select id="status" name="status" defaultValue={params.get('status') ?? ''} className="field h-10 min-h-10 cursor-pointer py-0"><option value="">Any stage</option>{LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}</select></div>
            <div><label htmlFor="intent" className="field-label mb-1 block">Request</label>
              <select id="intent" name="intent" defaultValue={params.get('intent') ?? ''} className="field h-10 min-h-10 cursor-pointer py-0"><option value="">Any request</option>{LEAD_INTENTS.map((s) => <option key={s} value={s}>{INTENT_LABELS[s]}</option>)}</select></div>
            <div><label htmlFor="from" className="field-label mb-1 block">From</label><input id="from" name="from" type="date" defaultValue={params.get('from') ?? ''} className="field h-10 min-h-10" /></div>
            <div><label htmlFor="to" className="field-label mb-1 block">To</label><input id="to" name="to" type="date" defaultValue={params.get('to') ?? ''} className="field h-10 min-h-10" /></div>
            <div className="flex items-end gap-2"><button className="btn btn-primary min-h-10 px-4 text-sm">Filter</button><Link href="/admin/leads?view=list" className="btn btn-ghost min-h-10 px-3 text-sm">Reset</Link></div>
          </form>
          {result.items.length === 0 ? (
            <EmptyState title={params.toString() ? 'No leads match these filters' : 'No enquiries yet'} body={params.toString() ? 'Try a wider date range or another stage.' : 'Enquiries from your website appear here as soon as they’re sent.'} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] text-left text-sm">
                <caption className="sr-only">{result.total} leads</caption>
                <thead className="border-b border-line text-xs text-muted">
                  <tr>
                    <th scope="col" className="px-5 py-3 font-medium">Lead</th>
                    <th scope="col" className="px-3 py-3 font-medium">Request</th>
                    <th scope="col" className="px-3 py-3 font-medium">Stage</th>
                    {all && <th scope="col" className="px-3 py-3 font-medium">Advisor</th>}
                    <th scope="col" className="px-3 py-3 font-medium">Follow-up</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium">Received</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {result.items.map((l) => {
                    const overdue = l.nextReminderAt && new Date(l.nextReminderAt).getTime() < Date.now();
                    return (
                      <tr key={l.id} className="hover:bg-ivory/50">
                        <td className="px-5 py-3"><Link href={`/admin/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link><p className="text-muted">{l.phone}</p></td>
                        <td className="px-3 py-3"><p>{INTENT_LABELS[l.intent] ?? l.intent}</p><p className="max-w-56 truncate text-muted">{l.property?.title ?? l.budget ?? '—'}</p></td>
                        <td className="px-3 py-3"><LeadStatusBadge status={l.status} /></td>
                        {all && <td className="px-3 py-3 text-muted">{l.agent ?? <span className="font-medium text-[color-mix(in_oklab,var(--color-accent)_45%,black)]">Unassigned</span>}</td>}
                        <td className="px-3 py-3">{l.nextReminderAt ? <span className={cn('inline-flex items-center gap-1 text-xs', overdue ? 'font-semibold text-[var(--color-error)]' : 'text-muted')}><BellRing className="size-3.5" aria-hidden="true" />{overdue ? 'Overdue' : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(l.nextReminderAt))}</span> : <span className="text-muted">—</span>}</td>
                        <td className="px-5 py-3 text-right text-muted">{relativeTime(l.createdAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={result.page} totalPages={result.totalPages} href={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); n.set('view', 'list'); return `/admin/leads?${n}`; }} />
        </Panel>
      )}
    </>
  );
}
