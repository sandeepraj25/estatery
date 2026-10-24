import { Plus } from 'lucide-react';
import Link from 'next/link';
import { adminData } from '@/lib/admin-api';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { EmptyState, Forbidden, PageHeader, Pager, Panel, relativeTime } from '@/components/admin/ui';
import { cn } from '@/lib/format';

export const metadata = { title: 'Articles' };

interface ListResult {
  items: Array<{ id: string; title: string; slug: string; category: string; status: 'draft' | 'published'; image: string; publishedAt: string | null; updatedAt: string }>;
  page: number; totalPages: number; total: number; counts: { draft: number; published: number };
}

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.status === 'draft' || sp.status === 'published') params.set('status', sp.status);
  if (sp.q) params.set('q', sp.q.slice(0, 80));
  if (sp.page) params.set('page', sp.page);
  const res = await adminData<ListResult>(`admin/articles?${params}`);
  if (!res.ok) return <Forbidden message={res.message} />;
  const d = res.data;
  const tabs = [
    { label: 'All', status: undefined, n: d.counts.draft + d.counts.published },
    { label: 'Published', status: 'published', n: d.counts.published },
    { label: 'Drafts', status: 'draft', n: d.counts.draft },
  ];
  return (
    <>
      <PageHeader title="Articles" description="Guides and market notes for the Insights section of your website." actions={<Link href="/admin/articles/new" className="btn btn-primary min-h-10"><Plus className="size-4" aria-hidden="true" />New article</Link>} />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <nav aria-label="Filter by status" className="flex gap-1">
            {tabs.map((t) => {
              const active = (sp.status ?? undefined) === t.status;
              return (
                <Link key={t.label} href={t.status ? `/admin/articles?status=${t.status}` : '/admin/articles'} aria-current={active ? 'page' : undefined} className={cn('rounded-lg px-3 py-1.5 text-sm font-medium', active ? 'bg-primary text-inverse' : 'text-muted hover:text-ink')}>
                  {t.label} <span className="tabular-nums opacity-70">{t.n}</span>
                </Link>
              );
            })}
          </nav>
          <form className="flex gap-2">
            {sp.status && <input type="hidden" name="status" value={sp.status} />}
            <label htmlFor="q" className="sr-only">Search articles</label>
            <input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Search headlines" className="field h-10 min-h-10 w-56" />
            <button className="btn btn-ghost min-h-10 px-3 text-sm">Search</button>
          </form>
        </div>
        {d.items.length === 0 ? (
          <EmptyState title={sp.q || sp.status ? 'No articles match' : 'No articles yet'} body="Market reports and buying guides build trust and bring visitors from search engines." action={<Link href="/admin/articles/new" className="btn btn-primary min-h-10">Write your first article</Link>} />
        ) : (
          <ul className="divide-y divide-line">
            {d.items.map((a) => (
              <li key={a.id} className="relative flex items-center gap-4 px-4 py-3 hover:bg-ivory/50">
                <div className="media-fallback relative hidden h-14 w-20 shrink-0 overflow-hidden rounded-lg sm:block">{a.image && <Image src={a.image} alt="" fill sizes="80px" className="object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <Link href={`/admin/articles/${a.id}`} className="font-medium after:absolute after:inset-0 hover:underline">{a.title}</Link>
                  <p className="truncate text-sm text-muted">{a.category} · edited {relativeTime(a.updatedAt)}</p>
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', a.status === 'published' ? 'bg-[var(--color-success)]/12 text-[var(--color-success)]' : 'bg-line text-ink/75')}>{a.status === 'published' ? 'Published' : 'Draft'}</span>
              </li>
            ))}
          </ul>
        )}
        <Pager page={d.page} totalPages={d.totalPages} href={(p) => { const n = new URLSearchParams(params); n.set('page', String(p)); return `/admin/articles?${n}`; }} />
      </Panel>
    </>
  );
}
