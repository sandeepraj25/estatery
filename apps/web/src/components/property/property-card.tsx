import { BadgeCheck, Bath, BedDouble, MapPin, Maximize2 } from 'lucide-react';
import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import { PROPERTY_TYPE_LABELS, type PublicProperty } from '@estatery/shared';
import { cn, formatPrice } from '@/lib/format';
import { FavouriteButton } from './favourite-button';

interface Props {
  property: PublicProperty;
  /** "feature" = large editorial card; "standard" = grid card; "row" = compact horizontal. */
  layout?: 'feature' | 'standard' | 'row';
  priority?: boolean;
  sizes?: string;
}

function StatusBadges({ p }: { p: PublicProperty }) {
  const closed = p.status === 'sold' || p.status === 'rented';
  return (
    <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
      {closed && <span className="rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">{p.status === 'sold' ? 'Sold' : 'Rented'}</span>}
      {!closed && p.badges.isNew && <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-ink">New</span>}
      {!closed && p.badges.featured && <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-primary">Featured</span>}
    </div>
  );
}

export function PropertyCard({ property: p, layout = 'standard', priority, sizes }: Props) {
  const img = p.images[0];
  const href = `/properties/${p.slug}`;
  const facts = [
    p.bhk ? { icon: BedDouble, label: `${p.bhk} BHK` } : null,
    p.bathrooms ? { icon: Bath, label: `${p.bathrooms} bath` } : null,
    { icon: Maximize2, label: `${new Intl.NumberFormat('en-IN').format(p.areaSqft)} sq ft` },
  ].filter(Boolean) as Array<{ icon: typeof BedDouble; label: string }>;

  return (
    <article
      className={cn(
        'zoom-parent group relative flex overflow-hidden rounded-[var(--radius-card)] bg-white transition-[box-shadow,transform] duration-500 hover:-translate-y-1 hover:shadow-lift',
        layout === 'row' ? 'flex-row' : 'flex-col',
        layout === 'feature' && 'h-full',
      )}
    >
      <div
        className={cn(
          'zoom-media media-fallback relative shrink-0 overflow-hidden',
          layout === 'feature' && 'aspect-[4/3] lg:aspect-auto lg:min-h-[24rem] lg:flex-1',
          layout === 'standard' && 'aspect-[4/3]',
          layout === 'row' && 'w-[42%] min-h-full',
        )}
      >
        {img && (
          <Image
            src={img.url}
            alt={img.alt || p.title}
            fill
            priority={priority}
            sizes={sizes ?? (layout === 'feature' ? '(min-width:1024px) 60vw, 100vw' : '(min-width:1024px) 30vw, (min-width:640px) 50vw, 100vw')}
            className="object-cover"
          />
        )}
        <StatusBadges p={p} />
        <FavouriteButton id={p.id} title={p.title} className="absolute right-3 top-3 z-10" />
      </div>

      <div className={cn('flex flex-1 flex-col', layout === 'feature' ? 'p-6 lg:p-7' : 'p-5')}>
        <p className="flex items-center gap-1.5 text-sm text-muted">
          <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{p.location.locality}, {p.location.city}</span>
          {p.badges.verified && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[var(--color-success)]">
              <BadgeCheck className="size-4" aria-hidden="true" /> Verified
            </span>
          )}
        </p>
        <h3 className={cn('mt-2 font-heading font-semibold leading-snug text-ink', layout === 'feature' ? 'text-[length:var(--text-card-title)]' : 'text-lg')}>
          {/* Whole card is clickable via the stretched link; the heart button sits above it. */}
          <Link href={href} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-[var(--radius-card)] focus-visible:after:ring-2 focus-visible:after:ring-accent">
            {p.title}
          </Link>
        </h3>
        {layout === 'feature' && <p className="mt-2 line-clamp-2 text-muted">{p.summary}</p>}

        <ul className="mt-4 mb-5 flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-ink/80">
          {facts.map((f) => (
            <li key={f.label} className="inline-flex items-center gap-1.5">
              <f.icon className="size-4 text-muted" aria-hidden="true" />
              {f.label}
            </li>
          ))}
        </ul>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-line pt-4">
          <div>
            <p className="text-xs text-muted">{PROPERTY_TYPE_LABELS[p.type]} · {p.listingType === 'rent' ? 'For rent' : 'For sale'}</p>
            <p className="font-heading text-xl font-bold tracking-tight text-ink">{formatPrice(p.price, p.priceUnit, p.currency)}</p>
          </div>
          <span className="relative z-[1] text-sm font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4 transition-colors group-hover:text-primary">
            View details
          </span>
        </div>
      </div>
    </article>
  );
}
