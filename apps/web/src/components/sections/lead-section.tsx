import { Clock, Mail, MessageCircle, Phone } from 'lucide-react';
import type { HomeSection, SiteSettings } from '@estatery/shared';
import { LeadForm } from '@/components/forms/lead-form';
import { RevealImage } from '@/components/site/reveal-image';

type Data = Extract<HomeSection, { type: 'lead' }>['data'];

export function LeadSection({ data, settings }: { data: Data; settings: SiteSettings }) {
  const wa = settings.contact.whatsapp.replace(/[^\d]/g, '');
  return (
    <section id="contact" aria-labelledby="lead-title" className="surface-dark relative overflow-hidden">
      <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
        <RevealImage src={data.image} alt="" sizes="(min-width:1024px) 45vw, 100vw" className="min-h-[18rem] lg:min-h-full" />
        <div className="container-site !max-w-none py-[var(--section-y)] lg:!px-[clamp(2.5rem,5vw,6rem)]">
          {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
          <h2 id="lead-title" className="type-display type-section mt-4 max-w-xl">{data.title}</h2>
          <p className="mt-5 max-w-lg text-muted">{data.body}</p>

          <div className="mt-10 max-w-2xl">
            <LeadForm tone="dark" source="homepage" />
          </div>

          <ul className="mt-12 grid max-w-2xl gap-4 border-t border-white/12 pt-8 text-sm sm:grid-cols-2">
            <li><a href={`tel:${settings.contact.phone.replace(/\s/g, '')}`} className="inline-flex items-center gap-2.5 text-white/85 hover:text-accent"><Phone className="size-4 text-accent" aria-hidden="true" />{settings.contact.phone}</a></li>
            {wa && <li><a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 text-white/85 hover:text-accent"><MessageCircle className="size-4 text-accent" aria-hidden="true" />Chat on WhatsApp</a></li>}
            <li><a href={`mailto:${settings.contact.email}`} className="inline-flex items-center gap-2.5 text-white/85 hover:text-accent"><Mail className="size-4 text-accent" aria-hidden="true" />{settings.contact.email}</a></li>
            <li className="inline-flex items-center gap-2.5 text-muted"><Clock className="size-4 text-accent" aria-hidden="true" />{settings.contact.hours}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}
