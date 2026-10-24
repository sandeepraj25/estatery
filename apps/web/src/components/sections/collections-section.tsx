import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import type { HomeSection } from '@estatery/shared';
import { cn } from '@/lib/format';

type Data = Extract<HomeSection, { type: 'collections' }>['data'];

export function CollectionsSection({ data }: { data: Data }) {
  const [hero, ...rest] = data.items;
  if (!hero) return null;
  const Tile = ({ item, big }: { item: typeof hero; big?: boolean }) => (
    <Link href={item.href} className={cn('zoom-parent group relative flex h-full min-h-[20rem] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-7 text-white sm:p-9', big && 'lg:min-h-[40rem]')}>
      <span className="zoom-media media-fallback absolute inset-0">
        <Image src={item.image} alt="" fill sizes={big ? '(min-width:1024px) 60vw, 100vw' : '(min-width:1024px) 40vw, 100vw'} className="object-cover" />
      </span>
      <span className="absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/25 to-transparent" />
      <span className="relative max-w-md">
        <span className={cn('type-display block', big ? 'text-[clamp(2.25rem,1.6rem+2.4vw,3.75rem)]' : 'text-3xl')}>{item.title}</span>
        <span className="mt-3 block text-white/80">{item.description}</span>
        <span className="mt-5 inline-block text-sm font-semibold underline decoration-accent decoration-2 underline-offset-[6px]">Explore the collection</span>
      </span>
    </Link>
  );
  return (
    <section aria-labelledby="collections-title" className="section">
      <div className="container-site">
        <div className="max-w-2xl">
          {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
          <h2 id="collections-title" className="type-display type-section mt-4">{data.title}</h2>
        </div>
        <div className="mt-14 grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <Tile item={hero} big />
          {rest.length > 0 && (
            <div className="grid gap-4">
              {rest.slice(0, 2).map((item) => <Tile key={item.href} item={item} />)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
