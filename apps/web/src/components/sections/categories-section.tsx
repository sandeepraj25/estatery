'use client';

import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import { useState } from 'react';
import type { HomeSection } from '@estatery/shared';
import { cn } from '@/lib/format';

type Data = Extract<HomeSection, { type: 'categories' }>['data'];

/** "Find your space": panels that widen on hover/focus (desktop); a stacked list on mobile. */
export function CategoriesSection({ data }: { data: Data }) {
  const [active, setActive] = useState(0);
  return (
    <section aria-labelledby="categories-title" className="section">
      <div className="container-site">
        <div className="max-w-2xl">
          {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
          <h2 id="categories-title" className="type-display type-section mt-4">{data.title}</h2>
        </div>

        <ul className="mt-14 flex flex-col gap-3 lg:h-[34rem] lg:flex-row">
          {data.items.map((item, i) => {
            const on = i === active;
            return (
              <li
                key={item.href}
                className={cn('transition-[flex-grow] duration-700 ease-[var(--ease-out)] lg:min-w-0', on ? 'lg:grow-[3.2]' : 'lg:grow')}
                style={{ flexBasis: 0 }}
                onMouseEnter={() => setActive(i)}
              >
                <Link
                  href={item.href}
                  onFocus={() => setActive(i)}
                  className="group relative flex h-48 flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-6 text-white sm:h-56 lg:h-full"
                >
                  <span className="media-fallback absolute inset-0">
                    <Image src={item.image} alt="" fill sizes="(min-width:1024px) 50vw, 100vw" className={cn('object-cover transition-transform duration-[1.2s]', on ? 'lg:scale-100' : 'lg:scale-110')} />
                  </span>
                  <span className={cn('absolute inset-0 bg-gradient-to-t from-primary/90 via-primary/30 to-primary/10 transition-opacity duration-700', !on && 'lg:bg-primary/55')} />
                  <span className="relative">
                    <span className={cn('block font-heading text-2xl font-semibold lg:whitespace-nowrap', !on && 'lg:[writing-mode:vertical-rl] lg:rotate-180')}>
                      {item.label}
                    </span>
                    <span className={cn('mt-2 block max-w-xs text-white/80 transition-opacity duration-500', on ? 'lg:opacity-100 lg:delay-300' : 'lg:hidden')}>
                      {item.description}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
