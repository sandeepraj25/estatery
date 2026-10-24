'use client';

import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { HomeSection, PublicTestimonial } from '@estatery/shared';
import { EASE_OUT, useMotionScale } from '@/lib/motion';
import { cn } from '@/lib/format';

type Data = Extract<HomeSection, { type: 'testimonials' }>['data'];

/** One story at a time, set large. Visitors move between stories; nothing auto-advances. */
export function TestimonialsSection({ data, testimonials }: { data: Data; testimonials: PublicTestimonial[] }) {
  const [i, setI] = useState(0);
  const m = useMotionScale();
  if (testimonials.length === 0) return null;
  const t = testimonials[i]!;
  const go = (d: number) => setI((x) => (x + d + testimonials.length) % testimonials.length);

  return (
    <section aria-labelledby="testimonials-title" className="surface-dark section">
      <div className="container-site">
        <div className="grid gap-12 lg:grid-cols-[1fr_2.2fr] lg:gap-20">
          <div>
            {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
            <h2 id="testimonials-title" className="type-display mt-4 text-[clamp(2rem,1.5rem+1.6vw,3rem)] leading-tight">{data.title}</h2>
            {data.trust.length > 0 && (
              <dl className="mt-10 space-y-5">
                {data.trust.map((x) => (
                  <div key={x.label} className="flex items-baseline gap-3">
                    <dt className="sr-only">{x.label}</dt>
                    <dd className="font-heading text-2xl font-bold text-accent">{x.value}</dd>
                    <dd className="text-sm text-muted">{x.label}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div aria-live="polite">
            <div className="flex gap-1 text-accent" aria-label={`${t.rating} out of 5 stars`} role="img">
              {Array.from({ length: t.rating }, (_, k) => <Star key={k} className="size-4 fill-current" aria-hidden="true" />)}
            </div>
            <AnimatePresence mode="wait">
              <motion.figure
                key={t.id}
                initial={{ opacity: 0, y: 14 * m }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 * m }}
                transition={{ duration: 0.5, ease: EASE_OUT }}
              >
                <blockquote className="type-display mt-6 text-[clamp(1.6rem,1.1rem+1.9vw,2.9rem)] leading-[1.2]">
                  “{t.quote}”
                </blockquote>
                <figcaption className="mt-8">
                  <span className="block font-heading font-semibold">{t.author}</span>
                  <span className="block text-sm text-muted">{t.context}</span>
                </figcaption>
              </motion.figure>
            </AnimatePresence>

            {testimonials.length > 1 && (
              <div className="mt-10 flex items-center gap-4">
                <button type="button" onClick={() => go(-1)} className="grid size-12 place-items-center rounded-full border border-white/25 hover:border-white" aria-label="Previous story">
                  <ChevronLeft className="size-5" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => go(1)} className="grid size-12 place-items-center rounded-full border border-white/25 hover:border-white" aria-label="Next story">
                  <ChevronRight className="size-5" aria-hidden="true" />
                </button>
                <div className="ml-2 flex gap-2" role="tablist" aria-label="Stories">
                  {testimonials.map((x, k) => (
                    <button
                      key={x.id}
                      role="tab"
                      aria-selected={k === i}
                      aria-label={`Story ${k + 1} of ${testimonials.length}: ${x.author}`}
                      onClick={() => setI(k)}
                      className={cn('h-1 rounded-full transition-all duration-500', k === i ? 'w-10 bg-accent' : 'w-5 bg-white/25 hover:bg-white/50')}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
