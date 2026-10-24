import type { Metadata } from 'next';
import Link from 'next/link';
import { getArticles, getSiteConfig } from '@/lib/api';
import { cn, formatDate } from '@/lib/format';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { PageHeader } from '@/components/content/page-header';

export const dynamic = 'force-dynamic';
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const { settings } = await getSiteConfig();
  const category = one(sp.category);
  return {
    title: category ? `${category} — Insights` : 'Insights',
    description: `Market reports, buying guides and advice from ${settings.businessName}.`,
    alternates: { canonical: '/insights' },
    // Filtered and paged views are useful to people, not as separate search results.
    robots: category || one(sp.page) ? { index: false, follow: true } : undefined,
  };
}

export default async function InsightsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const category = one(sp.category)?.slice(0, 40);
  const page = Math.max(1, Math.min(500, Number(one(sp.page)) || 1));
  const [list, { settings }] = await Promise.all([getArticles({ page, category, limit: 12 }), getSiteConfig()]);
  const [lead, ...rest] = page === 1 ? list.items : [undefined, ...list.items];
  const href = (q: { category?: string; page?: number }) => {
    const p = new URLSearchParams();
    if (q.category) p.set('category', q.category);
    if (q.page && q.page > 1) p.set('page', String(q.page));
    const s = p.toString();
    return s ? `/insights?${s}` : '/insights';
  };

  return (
    <>
      <PageHeader crumb="Insights" title="Insights" intro={`Market reports, buying guides and straight answers from the ${settings.businessName} team.`}>
        {list.categories.length > 1 && (
          <nav aria-label="Topics" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              {[undefined, ...list.categories].map((c) => {
                const active = c === category;
                return (
                  <li key={c ?? 'all'}>
                    <Link href={href({ category: c })} aria-current={active ? 'page' : undefined} className={cn('inline-flex min-h-10 items-center rounded-full border px-4 text-sm font-medium transition-colors', active ? 'border-primary bg-primary text-inverse' : 'border-line hover:border-ink')}>
                      {c ?? 'All topics'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        )}
      </PageHeader>

      <div className="container-site pb-24">
        {list.items.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white p-12 text-center">
            <p className="font-heading text-xl font-semibold">{category ? `Nothing in ${category} yet` : 'No articles yet'}</p>
            <p className="mx-auto mt-2 max-w-md text-muted">New guides and market reports appear here as soon as they’re published.</p>
            {category && <Link href="/insights" className="btn btn-ghost mt-6">See all topics</Link>}
          </div>
        ) : (
          <>
            {lead && (
              <article className="zoom-parent group relative grid gap-8 border-b border-line pb-14 lg:grid-cols-[1.4fr_1fr] lg:items-end lg:gap-14">
                <div className="zoom-media media-fallback relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)]">
                  <Image src={lead.image} alt="" fill priority sizes="(min-width:1024px) 58vw, 100vw" className="object-cover" />
                </div>
                <div>
                  <p className="text-sm text-muted">{lead.category} · {formatDate(lead.publishedAt)} · {lead.readMinutes} min read</p>
                  <h2 className="type-display mt-3 text-[clamp(1.75rem,1.2rem+2vw,2.75rem)] leading-tight">
                    <Link href={`/insights/${lead.slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-accent hover:underline-offset-4">{lead.title}</Link>
                  </h2>
                  <p className="mt-4 text-muted">{lead.excerpt}</p>
                </div>
              </article>
            )}
            <ul className="mt-14 grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {rest.filter(Boolean).map((a) => (
                <li key={a!.id}>
                  <article className="zoom-parent group relative">
                    <div className="zoom-media media-fallback relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)]">
                      <Image src={a!.image} alt="" fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw" className="object-cover" />
                    </div>
                    <p className="mt-5 text-sm text-muted">{a!.category} · {formatDate(a!.publishedAt)}</p>
                    <h2 className="mt-2 font-heading text-[length:var(--text-card-title)] font-semibold leading-snug">
                      <Link href={`/insights/${a!.slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-accent hover:underline-offset-4">{a!.title}</Link>
                    </h2>
                    <p className="mt-2 line-clamp-3 text-muted">{a!.excerpt}</p>
                  </article>
                </li>
              ))}
            </ul>
            {list.totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-16 flex items-center justify-between border-t border-line pt-6 text-sm">
                {page > 1 ? <Link href={href({ category, page: page - 1 })} className="btn btn-ghost">Newer articles</Link> : <span />}
                <span className="text-muted">Page {page} of {list.totalPages}</span>
                {page < list.totalPages ? <Link href={href({ category, page: page + 1 })} className="btn btn-ghost">Older articles</Link> : <span />}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}
