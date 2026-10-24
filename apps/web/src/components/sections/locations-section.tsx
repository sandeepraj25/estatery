import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import type { HomeSection, PublicLocation } from '@estatery/shared';
import { cn } from '@/lib/format';
import { SectionHeading } from './section-heading';

type Data = Extract<HomeSection, { type: 'locations' }>['data'];

export function LocationsSection({ data, locations }: { data: Data; locations: PublicLocation[] }) {
  if (locations.length === 0) return null;
  return (
    <section aria-labelledby="locations-title" className="section pt-0">
      <div className="container-site">
        <SectionHeading id="locations-title" kicker={data.eyebrow} title={data.title} subtitle={data.subtitle} />
        <ul className="mt-14 grid auto-rows-[15rem] gap-4 sm:grid-cols-2 lg:auto-rows-[17rem] lg:grid-cols-4">
          {locations.slice(0, 5).map((loc, i) => (
            <li key={loc.id} className={cn(i === 0 && 'sm:col-span-2 sm:row-span-2')}>
              <Link
                href={`/properties?city=${encodeURIComponent(loc.city)}`}
                className="zoom-parent group relative flex h-full flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-6 text-white"
              >
                <span className="zoom-media media-fallback absolute inset-0">
                  <Image src={loc.image} alt="" fill sizes={i === 0 ? '(min-width:1024px) 50vw, 100vw' : '(min-width:1024px) 25vw, 50vw'} className="object-cover" />
                </span>
                <span className="absolute inset-0 bg-gradient-to-t from-primary/85 via-primary/20 to-transparent" />
                <span className="relative">
                  <span className={cn('type-display block', i === 0 ? 'text-5xl lg:text-6xl' : 'text-3xl')}>{loc.name}</span>
                  {i === 0 && <span className="mt-3 block max-w-sm text-white/80">{loc.blurb}</span>}
                  <span className="mt-3 inline-flex items-center gap-2 text-sm text-white/85">
                    {loc.propertyCount > 0 ? `${loc.propertyCount} ${loc.propertyCount === 1 ? 'home' : 'homes'} available` : 'Enquire for off-market homes'}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
