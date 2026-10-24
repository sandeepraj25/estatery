import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import type { HomeSection, PublicArticle } from '@estatery/shared';
import { formatDate } from '@/lib/format';
import { SectionHeading } from './section-heading';

type Data = Extract<HomeSection, { type: 'insights' }>['data'];

export function InsightsSection({ data, articles }: { data: Data; articles: PublicArticle[] }) {
  const [lead, ...rest] = articles;
  if (!lead) return null;
  return (
    <section id="insights" aria-labelledby="insights-title" className="section">
      <div className="container-site">
        <SectionHeading id="insights-title" kicker={data.eyebrow} title={data.title} subtitle={data.subtitle} action={<Link href="/insights" className="btn btn-ghost">All insights</Link>} />
        <div className="mt-14 grid gap-10 lg:grid-cols-[1.25fr_1fr] lg:gap-14">
          <article className="zoom-parent group relative">
            <div className="zoom-media media-fallback relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)]">
              <Image src={lead.image} alt="" fill sizes="(min-width:1024px) 55vw, 100vw" className="object-cover" />
            </div>
            <p className="mt-6 text-sm text-muted">{lead.category} · {lead.readMinutes} min read</p>
            <h3 className="mt-2 font-heading text-[length:var(--text-card-title)] font-semibold leading-snug">
              <Link href={`/insights/${lead.slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-accent hover:underline-offset-4">{lead.title}</Link>
            </h3>
            <p className="mt-3 max-w-xl text-muted">{lead.excerpt}</p>
          </article>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {rest.map((a) => (
              <li key={a.id} className="zoom-parent group relative grid grid-cols-[7rem_1fr] gap-5 py-6 sm:grid-cols-[9rem_1fr]">
                <div className="zoom-media media-fallback relative aspect-square overflow-hidden rounded-xl">
                  <Image src={a.image} alt="" fill sizes="9rem" className="object-cover" />
                </div>
                <div>
                  <p className="text-sm text-muted">{a.category} · {formatDate(a.publishedAt)}</p>
                  <h3 className="mt-1.5 font-heading text-lg font-semibold leading-snug">
                    <Link href={`/insights/${a.slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-accent hover:underline-offset-4">{a.title}</Link>
                  </h3>
                  <p className="mt-1.5 line-clamp-2 text-sm text-muted">{a.excerpt}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
