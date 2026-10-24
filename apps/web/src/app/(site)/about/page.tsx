import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getHomeBundle, getPage, getSiteConfig, siteOrigin } from '@/lib/api';
import { breadcrumbs, jsonLd } from '@/lib/seo';
import { PageHeader } from '@/components/content/page-header';
import { RichText } from '@/components/content/rich-text';
import { RevealImage } from '@/components/site/reveal-image';
import { AgentsSection } from '@/components/sections/agents-section';
import { TestimonialsSection } from '@/components/sections/testimonials-section';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('about');
  if (!page) return {};
  return { title: page.title, description: page.seoDescription || page.intro, alternates: { canonical: '/about' }, openGraph: { url: '/about', images: page.image ? [{ url: page.image }] : undefined } };
}

export default async function AboutPage() {
  const [page, { settings }] = await Promise.all([getPage('about'), getSiteConfig()]);
  if (!page) notFound();
  const needsPeople = page.showAdvisors || page.showTestimonials;
  const [bundle, origin] = await Promise.all([needsPeople ? getHomeBundle() : null, siteOrigin()]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: page.title, path: '/about' }]))} />
      <PageHeader crumb="About" title={page.title} intro={page.intro} />

      {page.image && (
        <div className="container-site">
          <RevealImage src={page.image} alt="" priority sizes="100vw" className="aspect-[16/9] rounded-[var(--radius-card)] sm:aspect-[21/9]" />
        </div>
      )}

      {page.highlights.length > 0 && (
        <div className="container-site mt-14">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-10 border-y border-line py-10 lg:grid-cols-4">
            {page.highlights.map((h) => (
              <div key={h.label} className="flex flex-col">
                <dt className="order-2 mt-2 text-sm text-muted">{h.label}</dt>
                <dd className="type-display order-1 text-[clamp(2rem,1.4rem+2.4vw,3.25rem)] leading-none">{h.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="container-site section !pt-16">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,68ch)_1fr] lg:gap-20">
          <RichText text={page.body} className="text-[length:var(--text-body-lg)] leading-[1.75]" />
          <aside className="lg:pt-4">
            <div className="rounded-[var(--radius-card)] bg-white p-7 lg:sticky lg:top-28">
              <p className="font-heading text-lg font-semibold">Talk to {settings.businessName}</p>
              <p className="mt-2 text-sm text-muted">{settings.contact.hours}</p>
              <div className="mt-6 flex flex-col gap-3">
                <Link href="/contact" className="btn btn-primary">Send an enquiry</Link>
                <a href={`tel:${settings.contact.phone.replace(/\s/g, '')}`} className="btn btn-ghost">Call {settings.contact.phone}</a>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {bundle && page.showAdvisors && <AgentsSection data={{ eyebrow: 'Our advisors', title: 'The people you’ll work with.', subtitle: 'One advisor stays with you from the first call to the day you get the keys.' }} agents={bundle.agents} />}
      {bundle && page.showTestimonials && <TestimonialsSection data={{ eyebrow: 'Client stories', title: 'In our clients’ words.', subtitle: '', trust: [] }} testimonials={bundle.testimonials} />}
    </>
  );
}
