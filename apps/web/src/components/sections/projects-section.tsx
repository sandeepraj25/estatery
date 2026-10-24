'use client';

import { SafeImage as Image } from '@/components/ui/safe-image';
import Link from 'next/link';
import { useState } from 'react';
import type { HomeSection, PublicProject } from '@estatery/shared';
import { cn, formatPrice } from '@/lib/format';

type Data = Extract<HomeSection, { type: 'projects' }>['data'];

const STATUS: Record<PublicProject['status'], string> = {
  'pre-launch': 'Pre-launch',
  'under-construction': 'Under construction',
  'ready-to-move': 'Ready to move',
};

/**
 * An index of developments: hovering or focusing a row swaps the large image.
 * On small screens each project shows its own image instead.
 */
export function ProjectsSection({ data, projects }: { data: Data; projects: PublicProject[] }) {
  const [active, setActive] = useState(0);
  if (projects.length === 0) return null;
  const current = projects[active] ?? projects[0]!;

  return (
    <section id="projects" aria-labelledby="projects-title" className="surface-dark section">
      <div className="container-site">
        <div className="grid gap-14 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
            <h2 id="projects-title" className="type-display type-section mt-4 max-w-xl">{data.title}</h2>
            {data.subtitle && <p className="mt-5 max-w-md text-muted">{data.subtitle}</p>}

            <ul className="mt-12 border-t border-white/12">
              {projects.map((p, i) => (
                <li key={p.id} className="border-b border-white/12">
                  <Link
                    href={`/properties?project=${encodeURIComponent(p.slug)}`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    className="group grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <span className="media-fallback relative block aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] lg:hidden">
                      <Image src={p.image} alt="" fill sizes="100vw" className="object-cover" />
                    </span>
                    <span>
                      <span className={cn('block font-heading text-2xl font-semibold transition-colors', i === active ? 'text-white' : 'text-white/60 group-hover:text-white')}>
                        {p.name}
                      </span>
                      <span className="mt-1 block text-sm text-muted">
                        {p.locality}, {p.city} · {p.configurations}
                      </span>
                    </span>
                    <span className="flex items-center gap-4 sm:flex-col sm:items-end sm:gap-1">
                      <span className="text-sm text-muted">From</span>
                      <span className="font-heading text-xl font-bold text-accent">{formatPrice(p.startingPrice)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="relative hidden lg:block">
            <div className="sticky top-28">
              <div className="media-fallback relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)]">
                {projects.map((p, i) => (
                  <Image
                    key={p.id}
                    src={p.image}
                    alt={i === active ? `${p.name}, ${p.locality}` : ''}
                    fill
                    sizes="45vw"
                    className={cn('object-cover transition-[opacity,transform] duration-700', i === active ? 'scale-100 opacity-100' : 'scale-[1.04] opacity-0')}
                  />
                ))}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-primary/90 to-transparent p-7 pt-24">
                  <p className="inline-flex rounded-full border border-white/25 px-3 py-1 text-xs text-white/85">{STATUS[current.status]} · Possession {current.possession}</p>
                  <p className="mt-4 max-w-sm text-white/85">{current.summary}</p>
                  <p className="mt-2 text-sm text-muted">by {current.developer}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
