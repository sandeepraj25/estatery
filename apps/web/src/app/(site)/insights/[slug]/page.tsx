import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, getArticle, getSiteConfig, siteOrigin } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { breadcrumbs, jsonLd } from '@/lib/seo';
import { SafeImage as Image } from '@/components/ui/safe-image';
import { RichText } from '@/components/content/rich-text';
import { RevealImage } from '@/components/site/reveal-image';

export const dynamic = 'force-dynamic';

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,120}$/.test(slug)) notFound();
  try {
    return await getArticle(slug);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await load((await params).slug);
  const path = `/insights/${a.slug}`;
  return {
    title: a.seoTitle || a.title,
    description: a.seoDescription || a.excerpt,
    alternates: { canonical: path },
    openGraph: { url: path, type: 'article', images: [{ url: a.image, alt: a.imageAlt || undefined }], publishedTime: a.publishedAt, modifiedTime: a.updatedAt, section: a.category },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const a = await load((await params).slug);
  const [{ settings, pages }, origin] = await Promise.all([getSiteConfig(), siteOrigin()]);
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: a.title,
    description: a.excerpt,
    image: [a.image],
    datePublished: a.publishedAt,
    dateModified: a.updatedAt,
    articleSection: a.category,
    mainEntityOfPage: `${origin}/insights/${a.slug}`,
    author: a.author ? { '@type': 'Person', name: a.author.name, jobTitle: a.author.title } : { '@type': 'Organization', name: settings.businessName },
    publisher: { '@type': 'Organization', name: settings.businessName, url: origin },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(articleLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: 'Insights', path: '/insights' }, { name: a.title, path: `/insights/${a.slug}` }]))} />
      <article className="pt-32 pb-24">
        <header className="container-site max-w-4xl">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <ol className="flex flex-wrap gap-2">
              <li><Link href="/" className="hover:text-ink">Home</Link></li><li aria-hidden="true">/</li>
              <li><Link href="/insights" className="hover:text-ink">Insights</Link></li><li aria-hidden="true">/</li>
              <li><Link href={`/insights?category=${encodeURIComponent(a.category)}`} className="hover:text-ink">{a.category}</Link></li>
            </ol>
          </nav>
          <h1 className="type-display type-section mt-6">{a.title}</h1>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted">
            {a.author && (
              <span className="flex items-center gap-3 text-ink">
                {a.author.photoUrl && <span className="media-fallback relative size-10 overflow-hidden rounded-full"><Image src={a.author.photoUrl} alt="" fill sizes="40px" className="object-cover" /></span>}
                <span><span className="block font-medium">{a.author.name}</span><span className="text-muted">{a.author.title}</span></span>
              </span>
            )}
            <span><time dateTime={a.publishedAt}>{formatDate(a.publishedAt)}</time> · {a.readMinutes} min read</span>
          </div>
        </header>
        <div className="container-site mt-12 max-w-6xl">
          <RevealImage src={a.image} alt={a.imageAlt} priority sizes="100vw" className="aspect-[16/9] rounded-[var(--radius-card)] sm:aspect-[21/9]" />
        </div>
        <div className="container-site mt-12 max-w-[68ch]">
          <p className="text-xl font-medium leading-relaxed">{a.excerpt}</p>
          <RichText text={a.body} className="mt-8 text-[length:var(--text-body-lg)] leading-[1.75]" />
          <div className="mt-14 rounded-[var(--radius-card)] bg-white p-7">
            <p className="font-heading text-lg font-semibold">Have a question about this?</p>
            <p className="mt-1 text-muted">{a.author ? `${a.author.name.split(' ')[0]} and the team` : 'Our advisors'} can help with your situation.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href={pages?.contact === false ? '/#contact' : '/contact'} className="btn btn-primary">Talk to an advisor</Link>
              <Link href="/properties" className="btn btn-ghost">Browse homes</Link>
            </div>
          </div>
        </div>
      </article>

      {a.related.length > 0 && (
        <section aria-labelledby="related-title" className="border-t border-line bg-white py-20">
          <div className="container-site">
            <h2 id="related-title" className="type-display text-[clamp(1.75rem,1.3rem+1.6vw,2.5rem)]">Keep reading</h2>
            <ul className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
              {a.related.map((r) => (
                <li key={r.slug}>
                  <article className="zoom-parent group relative">
                    <div className="zoom-media media-fallback relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)]">
                      <Image src={r.image} alt="" fill sizes="(min-width:1024px) 30vw, (min-width:640px) 45vw, 100vw" className="object-cover" />
                    </div>
                    <p className="mt-4 text-sm text-muted">{r.category} · {r.readMinutes} min read</p>
                    <h3 className="mt-1.5 font-heading text-lg font-semibold leading-snug">
                      <Link href={`/insights/${r.slug}`} className="after:absolute after:inset-0 hover:underline hover:decoration-accent hover:underline-offset-4">{r.title}</Link>
                    </h3>
                  </article>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </>
  );
}
