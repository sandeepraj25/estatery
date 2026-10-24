import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage, getSiteConfig, siteOrigin } from '@/lib/api';
import { breadcrumbs, jsonLd } from '@/lib/seo';
import { PageHeader } from '@/components/content/page-header';
import { RichText } from '@/components/content/rich-text';
import { LeadForm } from '@/components/forms/lead-form';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('contact');
  if (!page) return {};
  return { title: page.title, description: page.seoDescription || page.intro, alternates: { canonical: '/contact' }, openGraph: { url: '/contact' } };
}

export default async function ContactPage() {
  const [page, { settings }, origin] = await Promise.all([getPage('contact'), getSiteConfig(), siteOrigin()]);
  if (!page) notFound();
  const c = settings.contact;
  const wa = c.whatsapp.replace(/[^\d]/g, '');
  const mapHref = page.mapUrl || (c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : '');
  const methods = [
    c.phone && { icon: Phone, label: 'Call', value: c.phone, href: `tel:${c.phone.replace(/\s/g, '')}` },
    wa && { icon: MessageCircle, label: 'WhatsApp', value: c.whatsapp, href: `https://wa.me/${wa}`, external: true },
    c.email && { icon: Mail, label: 'Email', value: c.email, href: `mailto:${c.email}` },
  ].filter(Boolean) as Array<{ icon: typeof Phone; label: string; value: string; href: string; external?: boolean }>;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbs(origin, [{ name: 'Home', path: '/' }, { name: page.title, path: '/contact' }]))} />
      <PageHeader crumb="Contact" title={page.title} intro={page.intro} />
      <div className="container-site pb-24">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.25fr] lg:gap-20">
          <div>
            <ul className="divide-y divide-line border-y border-line">
              {methods.map((m) => (
                <li key={m.label}>
                  <a href={m.href} {...(m.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})} className="group flex items-center gap-5 py-5">
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white text-ink"><m.icon className="size-5" aria-hidden="true" /></span>
                    <span>
                      <span className="block text-sm text-muted">{m.label}</span>
                      <span className="font-heading text-lg font-semibold group-hover:underline group-hover:decoration-accent group-hover:underline-offset-4">{m.value}</span>
                    </span>
                  </a>
                </li>
              ))}
              {c.address && (
                <li className="flex items-start gap-5 py-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><MapPin className="size-5" aria-hidden="true" /></span>
                  <span>
                    <span className="block text-sm text-muted">Office</span>
                    <address className="not-italic">{c.address}</address>
                    {mapHref && <a href={mapHref} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-sm font-medium underline decoration-accent underline-offset-4">Open in Google Maps</a>}
                  </span>
                </li>
              )}
              {c.hours && (
                <li className="flex items-center gap-5 py-5">
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white"><Clock className="size-5" aria-hidden="true" /></span>
                  <span><span className="block text-sm text-muted">Hours</span>{c.hours}</span>
                </li>
              )}
            </ul>
            {page.body && <RichText text={page.body} className="mt-8 text-sm leading-relaxed" />}
          </div>
          {page.showForm && (
            <section aria-labelledby="enquiry-title" className="rounded-[var(--radius-card)] bg-white p-6 sm:p-10">
              <h2 id="enquiry-title" className="font-heading text-2xl font-semibold">Send an enquiry</h2>
              <p className="mt-2 text-muted">Tell us what you’re looking for. An advisor replies within one working day.</p>
              <div className="mt-8"><LeadForm source="contact-page" /></div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
