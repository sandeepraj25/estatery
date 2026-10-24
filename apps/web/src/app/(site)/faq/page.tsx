import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { plainText } from '@estatery/shared';
import { getPage, getSiteConfig, siteOrigin } from '@/lib/api';
import { breadcrumbs, jsonLd } from '@/lib/seo';
import { PageHeader } from '@/components/content/page-header';
import { RichText } from '@/components/content/rich-text';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('faq');
  if (!page) return {};
  return { title: page.title, description: page.seoDescription || page.intro, alternates: { canonical: '/faq' }, openGraph: { url: '/faq' } };
}

export default async function FaqPage() {
  const [page, { settings, pages }, origin] = await Promise.all([getPage('faq'), getSiteConfig(), siteOrigin()]);
  if (!page) notFound();
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.items.map((i) => ({ '@type': 'Question', name: i.question, acceptedAnswer: { '@type': 'Answer', text: plainText(i.answer) } })),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(faqLd)} />
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: page.title, path: '/faq' }]))} />
      <PageHeader crumb="FAQ" title={page.title} intro={page.intro} />
      <div className="container-site pb-24">
        <div className="max-w-3xl border-t border-line">
          {page.items.map((item, i) => (
            <details key={i} className="group border-b border-line" {...(i === 0 ? { open: true } : {})}>
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 py-6 font-heading text-lg font-semibold [&::-webkit-details-marker]:hidden">
                {item.question}
                <Plus className="mt-1 size-5 shrink-0 text-accent transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <RichText text={item.answer} className="max-w-[62ch] pb-7 leading-relaxed" />
            </details>
          ))}
        </div>
        <div className="mt-14 max-w-3xl rounded-[var(--radius-card)] bg-white p-7 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="font-heading text-lg font-semibold">Still have a question?</p>
            <p className="mt-1 text-muted">Our advisors answer within one working day.</p>
          </div>
          <div className="mt-5 flex shrink-0 gap-3 sm:mt-0">
            {pages?.contact !== false && <Link href="/contact" className="btn btn-primary">Ask us</Link>}
            <a href={`tel:${settings.contact.phone.replace(/\s/g, '')}`} className="btn btn-ghost">Call</a>
          </div>
        </div>
      </div>
    </>
  );
}
