import Link from 'next/link';
import { PROPERTY_STATUSES, PROPERTY_TYPE_LABELS, type PropertyStatus, type PropertyType } from '@estatery/shared';
import { adminData, requireUser } from '@/lib/admin-api';
import { formatPrice } from '@/lib/format';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { EmptyState, Forbidden, PageHeader, Pager, Panel, PropertyStatusBadge, relativeTime } from '@/components/admin/ui';

export const metadata = { title: 'Properties' };

interface Row {
  id: string; slug: string; title: string; status: PropertyStatus; listingType: 'sale' | 'rent'; type: PropertyType; price: number;
  priceUnit: 'total' | 'month'; city: string; locality: string; featured: boolean; verified: boolean; image: string | null; agent: string | null; updatedAt: string;
}
interface Result { items: Row[]; page: number; totalPages: number; total: number }

export default async function AdminProperties({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.q) params.set('q', sp.q.slice(0, 80));
  if (sp.status && (PROPERTY_STATUSES as readonly string[]).includes(sp.status)) params.set('status', sp.status);
  if (sp.page) params.set('page', sp.page);
  const [res, user] = await Promise.all([adminData<Result>(`admin/properties?${params}`), requireUser()]);
  const canEdit = user.permissions.includes('properties:write');
  if (!res.ok) return <Forbidden message={res.message} />;
  const { items, page, totalPages, total } = res.data;
  const href = (p: number) => {
    const n = new URLSearchParams(params);
    n.set('page', String(p));
    return `/admin/properties?${n}`;
  };
  const status = params.get('status');

  return (
    <>
      <PageHeader
        title="Properties"
        description="Every listing, including drafts and archived homes that visitors can’t see."
        actions={
          <>
            <a href="/api/admin/admin/properties/export.csv" className="btn btn-ghost min-h-10 bg-white">Export CSV</a>
            {canEdit && <Link href="/admin/properties/import" className="btn btn-ghost min-h-10 bg-white">Import CSV</Link>}
            {canEdit && <Link href="/admin/properties/new" className="btn btn-primary min-h-10">New listing</Link>}
          </>
        }
      />
      <Panel>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {[null, ...PROPERTY_STATUSES].map((s) => {
              const n = new URLSearchParams(params);
              n.delete('page');
              if (s) n.set('status', s); else n.delete('status');
              const on = status === s;
              return (
                <Link key={s ?? 'all'} href={`/admin/properties?${n}`} aria-current={on ? 'true' : undefined} className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize ${on ? 'bg-primary text-inverse' : 'text-muted hover:bg-ivory hover:text-ink'}`}>
                  {s ?? 'All'}
                </Link>
              );
            })}
          </nav>
          <form className="flex gap-2" role="search">
            {status && <input type="hidden" name="status" value={status} />}
            <label htmlFor="q" className="sr-only">Search properties</label>
            <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Search title, locality or city" className="field h-10 min-h-10 w-64" />
            <button className="btn btn-primary min-h-10 px-4 text-sm">Search</button>
          </form>
        </div>

        {items.length === 0 ? (
          <EmptyState
            title={status || sp.q ? 'No properties match' : 'No listings yet'}
            body={status || sp.q ? 'Try another status or search term.' : 'Add your first listing, or import several from a spreadsheet.'}
            action={status || sp.q ? <Link href="/admin/properties" className="btn btn-ghost min-h-10">Clear filters</Link> : canEdit ? <Link href="/admin/properties/new" className="btn btn-primary min-h-10">New listing</Link> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <caption className="sr-only">{total} properties</caption>
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  <th scope="col" className="px-5 py-3 font-medium">Property</th>
                  <th scope="col" className="px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="px-3 py-3 font-medium">Type</th>
                  <th scope="col" className="px-3 py-3 text-right font-medium">Price</th>
                  <th scope="col" className="px-3 py-3 font-medium">Advisor</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((p) => (
                  <tr key={p.id} className="hover:bg-ivory/50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="media-fallback relative size-12 shrink-0 overflow-hidden rounded-lg">
                          {p.image && <Image src={p.image} alt="" fill sizes="48px" className="object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium"><Link href={`/admin/properties/${p.id}`} className="hover:underline">{p.title}</Link>{p.featured && <span className="ml-2 rounded bg-accent/25 px-1.5 py-0.5 text-[0.6875rem] font-semibold">Featured</span>}</p>
                          <p className="truncate text-muted">{p.locality}, {p.city}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3"><PropertyStatusBadge status={p.status} /></td>
                    <td className="px-3 py-3 text-muted">{PROPERTY_TYPE_LABELS[p.type]} · {p.listingType === 'rent' ? 'Rent' : 'Sale'}</td>
                    <td className="px-3 py-3 text-right font-heading font-semibold">{formatPrice(p.price, p.priceUnit)}</td>
                    <td className="px-3 py-3 text-muted">{p.agent ?? '—'}</td>
                    <td className="px-5 py-3 text-right text-muted">
                      {['published', 'sold', 'rented'].includes(p.status)
                        ? <a href={`/properties/${p.slug}`} target="_blank" rel="noopener" className="mr-3 font-medium text-ink underline decoration-accent underline-offset-4">View</a>
                        : null}
                      <Link href={`/admin/properties/${p.id}`} className="mr-3 font-medium text-ink underline decoration-accent underline-offset-4">{canEdit ? 'Edit' : 'Open'}</Link>
                      {relativeTime(p.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} totalPages={totalPages} href={href} />
      </Panel>
    </>
  );
}
