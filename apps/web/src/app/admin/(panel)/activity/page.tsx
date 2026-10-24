import { adminData } from '@/lib/admin-api';
import { EmptyState, Forbidden, PageHeader, Pager, Panel } from '@/components/admin/ui';

export const metadata = { title: 'Activity log' };

interface Result { items: Array<{ id: string; action: string; summary: string; actorName: string; ip: string | null; createdAt: string }>; page: number; totalPages: number }

const fmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const res = await adminData<Result>(`admin/audit?page=${Number(page) > 0 ? Number(page) : 1}`);
  if (!res.ok) return <Forbidden message={res.message} />;
  const { items, totalPages } = res.data;
  return (
    <>
      <PageHeader title="Activity log" description="Sign-ins, team changes and other sensitive actions on this site. Entries can’t be edited or deleted." />
      <Panel>
        {items.length === 0 ? <EmptyState title="Nothing recorded yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">When (IST)</th>
                  <th scope="col" className="px-3 py-3 font-medium">Who</th>
                  <th scope="col" className="px-3 py-3 font-medium">What happened</th>
                  <th scope="col" className="px-5 py-3 font-medium">IP address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((a) => (
                  <tr key={a.id} className={a.action === 'auth.token_reuse' || a.action === 'auth.locked' ? 'bg-[var(--color-error)]/5' : ''}>
                    <td className="whitespace-nowrap px-5 py-3 text-muted">{fmt.format(new Date(a.createdAt))}</td>
                    <td className="px-3 py-3 font-medium">{a.actorName}</td>
                    <td className="px-3 py-3">{a.summary}</td>
                    <td className="px-5 py-3 font-mono text-xs text-muted">{a.ip ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={res.data.page} totalPages={totalPages} href={(p) => `/admin/activity?page=${p}`} />
      </Panel>
    </>
  );
}
