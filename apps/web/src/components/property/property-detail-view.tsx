import { BadgeCheck, Bath, BedDouble, Building2, Check, MapPin, Maximize2, MessageCircle, Phone } from 'lucide-react';
import Link from 'next/link';
import { PROPERTY_TYPE_LABELS, type PublicProperty, type SiteSettings } from '@estatery/shared';
import { formatPrice } from '@/lib/format';
import { LeadForm } from '@/components/forms/lead-form';
import { ClientPropertyList } from './client-property-list';
import { FavouriteButton } from './favourite-button';
import { Gallery } from './gallery';
import { PropertyCard } from './property-card';
import { ShareButton } from './share-button';
import { TrackView } from './track-view';
import { SafeImage as Image } from '@/components/ui/safe-image';

function jsonLd(p: PublicProperty, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: p.title,
    description: p.summary,
    url,
    image: p.images.map((i) => i.url),
    datePosted: p.publishedAt ?? undefined,
    offers: {
      '@type': 'Offer',
      price: p.price,
      priceCurrency: p.currency,
      availability: p.status === 'published' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      businessFunction: p.listingType === 'rent' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
    },
    address: { '@type': 'PostalAddress', addressLocality: p.location.locality, addressRegion: p.location.state, addressCountry: 'IN' },
    ...(p.location.lat && p.location.lng ? { geo: { '@type': 'GeoCoordinates', latitude: p.location.lat, longitude: p.location.lng } } : {}),
  };
}

/**
 * The public listing page body. Rendered by the site route and by the Admin Panel preview
 * (with `preview` set: no view tracking, no enquiry form submission, no structured data).
 */
export function PropertyDetailView({ p, similar, settings, preview = false }: { p: PublicProperty; similar: PublicProperty[]; settings: SiteSettings; preview?: boolean }) {
  const closed = p.status === 'sold' || p.status === 'rented';
  const price = formatPrice(p.price, p.priceUnit, p.currency);
  const phone = p.agent?.phone || settings.contact.phone;
  const wa = settings.contact.whatsapp.replace(/[^\d]/g, '');
  const waText = encodeURIComponent(`Hi, I'm interested in "${p.title}" (${price}).`);

  const specs: Array<[string, string]> = [
    ['Property type', PROPERTY_TYPE_LABELS[p.type]],
    ['Listing', p.listingType === 'rent' ? 'For rent' : 'For sale'],
    ['Category', p.category === 'commercial' ? 'Commercial' : 'Residential'],
    ...(p.bhk ? ([['Bedrooms', `${p.bhk} BHK`]] as Array<[string, string]>) : []),
    ...(p.bathrooms ? ([['Bathrooms', String(p.bathrooms)]] as Array<[string, string]>) : []),
    ['Built-up area', `${new Intl.NumberFormat('en-IN').format(p.areaSqft)} sq ft`],
    ['Price per sq ft', p.priceUnit === 'total' ? `₹${new Intl.NumberFormat('en-IN').format(Math.round(p.price / p.areaSqft))}` : '—'],
    ...(p.project ? ([['Project', p.project.name]] as Array<[string, string]>) : []),
  ];

  const bbox = p.location.lat && p.location.lng
    ? [p.location.lng - 0.012, p.location.lat - 0.008, p.location.lng + 0.012, p.location.lat + 0.008].join(',')
    : null;

  return (
    <article className="pt-28 pb-24">
      {!preview && <TrackView id={p.id} />}
      {!preview && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(p, `/properties/${p.slug}`)).replace(/</g, '\\u003c') }} />}

      <div className="container-site">
        <nav aria-label="Breadcrumb" className="text-sm text-muted">
          <ol className="flex flex-wrap gap-2">
            <li><Link href="/" className="hover:text-ink">Home</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href="/properties" className="hover:text-ink">Properties</Link></li>
            <li aria-hidden="true">/</li>
            <li><Link href={`/properties?city=${encodeURIComponent(p.location.city)}`} className="hover:text-ink">{p.location.city}</Link></li>
          </ol>
        </nav>

        <header className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap gap-2">
              {closed && <span className="rounded-full bg-ink px-3 py-1 text-xs font-semibold text-white">{p.status === 'sold' ? 'Sold' : 'Rented'}</span>}
              {!closed && p.badges.featured && <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-primary">Featured</span>}
              {!closed && p.badges.isNew && <span className="rounded-full border border-line bg-white px-3 py-1 text-xs font-semibold">New listing</span>}
              {p.badges.verified && <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-success)]/10 px-3 py-1 text-xs font-semibold text-[var(--color-success)]"><BadgeCheck className="size-3.5" aria-hidden="true" />Verified</span>}
            </div>
            <h1 className="type-display type-section mt-4">{p.title}</h1>
            <p className="mt-3 flex items-center gap-1.5 text-muted"><MapPin className="size-4" aria-hidden="true" />{[p.location.locality, p.location.city, p.location.state].filter(Boolean).join(', ')}</p>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <p className="font-heading text-[clamp(1.75rem,1.4rem+1.4vw,2.75rem)] font-bold tracking-tight">{price}</p>
            <div className="flex gap-2">
              <FavouriteButton id={p.id} title={p.title} className="size-11 border border-line bg-white shadow-none" />
              <ShareButton title={p.title} />
            </div>
          </div>
        </header>

        <div className="mt-8"><Gallery images={p.images} title={p.title} /></div>

        <div className="mt-14 grid gap-14 lg:grid-cols-[1fr_24rem] xl:grid-cols-[1fr_26rem]">
          <div className="min-w-0">
            <ul className="flex flex-wrap gap-x-8 gap-y-4 border-y border-line py-6">
              {p.bhk && <li className="flex items-center gap-2.5"><BedDouble className="size-5 text-muted" aria-hidden="true" /><span><strong className="font-heading">{p.bhk}</strong> BHK</span></li>}
              {p.bathrooms && <li className="flex items-center gap-2.5"><Bath className="size-5 text-muted" aria-hidden="true" /><span><strong className="font-heading">{p.bathrooms}</strong> bathrooms</span></li>}
              <li className="flex items-center gap-2.5"><Maximize2 className="size-5 text-muted" aria-hidden="true" /><span><strong className="font-heading">{new Intl.NumberFormat('en-IN').format(p.areaSqft)}</strong> sq ft</span></li>
              <li className="flex items-center gap-2.5"><Building2 className="size-5 text-muted" aria-hidden="true" />{PROPERTY_TYPE_LABELS[p.type]}</li>
            </ul>

            <section aria-labelledby="about-home" className="mt-12">
              <h2 id="about-home" className="font-heading text-2xl font-semibold">About this home</h2>
              {p.summary && <p className="mt-4 text-[length:var(--text-body-lg)] font-medium leading-relaxed">{p.summary}</p>}
              <div className="mt-4 max-w-[68ch] space-y-4 leading-relaxed text-ink/85">
                {p.description.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </section>

            {p.amenities.length > 0 && (
              <section aria-labelledby="amenities" className="mt-12">
                <h2 id="amenities" className="font-heading text-2xl font-semibold">Amenities</h2>
                <ul className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                  {p.amenities.map((a) => <li key={a} className="flex items-center gap-2.5"><Check className="size-4 text-accent" aria-hidden="true" />{a}</li>)}
                </ul>
              </section>
            )}

            <section aria-labelledby="specs" className="mt-12">
              <h2 id="specs" className="font-heading text-2xl font-semibold">Specifications</h2>
              <dl className="mt-5 grid border-t border-line sm:grid-cols-2 sm:gap-x-10">
                {specs.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-line py-3.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="text-right font-medium">{v}</dd>
                  </div>
                ))}
              </dl>
            </section>

            {bbox && (
              <section aria-labelledby="location" className="mt-12">
                <h2 id="location" className="font-heading text-2xl font-semibold">Location</h2>
                <p className="mt-2 text-muted">{p.location.locality}, {p.location.city}. Exact address shared after your visit is confirmed.</p>
                <div className="media-fallback mt-5 aspect-[16/9] overflow-hidden rounded-[var(--radius-card)] border border-line">
                  <iframe
                    title={`Map of ${p.location.locality}, ${p.location.city}`}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.location.lat},${p.location.lng}`}
                    className="size-full"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <a href={`https://www.google.com/maps/search/?api=1&query=${p.location.lat},${p.location.lng}`} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold underline decoration-accent decoration-2 underline-offset-4">
                  Open in Google Maps
                </a>
              </section>
            )}
          </div>

          <aside aria-label="Contact" className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-[var(--radius-card)] border border-line bg-white p-6 shadow-soft">
              {p.agent && (
                <div className="flex items-center gap-4">
                  <div className="media-fallback relative size-16 shrink-0 overflow-hidden rounded-full">
                    <Image src={p.agent.photoUrl} alt="" fill sizes="64px" className="object-cover" />
                  </div>
                  <div>
                    <p className="font-heading font-semibold">{p.agent.name}</p>
                    <p className="text-sm text-muted">{p.agent.title}</p>
                  </div>
                </div>
              )}
              <div className="mt-5 grid grid-cols-2 gap-2">
                <a href={`tel:${phone.replace(/\s/g, '')}`} className="btn btn-ghost min-h-11 text-sm"><Phone className="size-4" aria-hidden="true" />Call</a>
                {wa && <a href={`https://wa.me/${wa}?text=${waText}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost min-h-11 text-sm"><MessageCircle className="size-4" aria-hidden="true" />WhatsApp</a>}
              </div>
              <div className="mt-6 border-t border-line pt-6">
                {closed ? (
                  <p className="text-muted">This home is no longer available. Tell us what you’re looking for and we’ll suggest similar homes.</p>
                ) : null}
                <div className={closed ? 'mt-5' : ''}>
                  {preview ? (
                    <p className="rounded-lg bg-ivory px-4 py-3 text-sm text-muted">The enquiry form appears here on the live page.</p>
                  ) : (
                    <LeadForm propertyId={p.id} propertyTitle={p.title} source="property-page" allowVisit={false} />
                  )}
                </div>
              </div>
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <section aria-labelledby="similar" className="mt-24">
            <h2 id="similar" className="font-heading text-2xl font-semibold">Similar homes in {p.location.city}</h2>
            <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {similar.map((s) => <li key={s.id}><PropertyCard property={s} /></li>)}
            </ul>
          </section>
        )}

        {!preview && (
          <section aria-label="Recently viewed" className="mt-24">
            <ClientPropertyList source="recent" excludeId={p.id} title="Recently viewed" />
          </section>
        )}
      </div>
    </article>
  );
}
