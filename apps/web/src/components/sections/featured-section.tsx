import Link from 'next/link';
import type { HomeSection, PublicProperty } from '@estatery/shared';
import { PropertyCard } from '@/components/property/property-card';
import { SectionHeading } from './section-heading';

type Data = Extract<HomeSection, { type: 'featured' }>['data'];

/**
 * Editorial layout: one lead property, two compact rows beside it, then the rest in a row.
 * Falls back gracefully for 1–2 listings and shows an empty state if there are none.
 */
export function FeaturedSection({ data, properties }: { data: Data; properties: PublicProperty[] }) {
  const [lead, ...rest] = properties;
  const side = rest.slice(0, 2);
  const more = rest.slice(2);
  return (
    <section aria-labelledby="featured-title" className="section">
      <div className="container-site">
        <SectionHeading
          id="featured-title"
          kicker={data.eyebrow}
          title={data.title}
          subtitle={data.subtitle}
          action={<Link href={data.cta.href} className="btn btn-ghost">{data.cta.label}</Link>}
        />

        {!lead ? (
          <div className="mt-14 rounded-[var(--radius-card)] border border-dashed border-line p-12 text-center">
            <p className="font-heading text-lg font-semibold">New residences are being added</p>
            <p className="mt-2 text-muted">Browse every available home in the meantime.</p>
            <Link href="/properties" className="btn btn-primary mt-6">Browse all properties</Link>
          </div>
        ) : (
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-12">
            <div className="sm:col-span-2 lg:col-span-7 lg:row-span-2">
              <PropertyCard property={lead} layout="feature" priority />
            </div>
            {side.map((p) => (
              <div key={p.id} className="sm:col-span-2 lg:col-span-5">
                <div className="hidden h-full sm:block"><PropertyCard property={p} layout="row" /></div>
                <div className="sm:hidden"><PropertyCard property={p} /></div>
              </div>
            ))}
            {more.map((p) => (
              <div key={p.id} className="sm:col-span-1 lg:col-span-4">
                <PropertyCard property={p} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
