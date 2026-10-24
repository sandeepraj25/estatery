'use client';

import { ArrowDown, MapPin } from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import type { HomeSection, PublicProperty } from '@estatery/shared';
import { HeroVisual } from '@/components/three/hero-visual';
import { formatPrice } from '@/lib/format';
import { EASE_OUT, useMotionScale } from '@/lib/motion';

type HeroData = Extract<HomeSection, { type: 'hero' }>['data'];

/** Splits the headline so the accent phrase sits on its own line (a line break, not a colour change). */
function headlineLines(headline: string, accent: string): string[] {
  if (accent && headline.endsWith(accent) && headline.length > accent.length) {
    return [headline.slice(0, -accent.length).trim(), accent];
  }
  return [headline];
}

export function HeroSection({ data, highlights }: { data: HeroData; highlights: PublicProperty[] }) {
  const m = useMotionScale();
  const lines = headlineLines(data.headline, data.accentWords);
  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: 28 * m },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay: m ? delay : 0, ease: EASE_OUT },
  });

  return (
    <section aria-labelledby="hero-title" className="surface-dark relative isolate flex min-h-[max(42rem,100svh)] flex-col overflow-hidden">
      <HeroVisual
        sceneEnabled={data.scene.enabled}
        variant={data.scene.variant}
        fallbackImage={data.scene.fallbackImage || data.backgroundImage}
        alt="Contemporary residence at dusk"
      />

      <div className="container-site relative z-10 flex flex-1 flex-col justify-center pt-32 pb-44 lg:pb-48">
        <div className="max-w-[44rem]">
          {data.eyebrow && (
            <motion.p {...reveal(0.1)} className="kicker">{data.eyebrow}</motion.p>
          )}
          <h1 id="hero-title" className="type-display type-hero mt-6">
            {lines.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.08em]">
                <motion.span
                  className={i === 1 ? 'block text-white/70' : 'block'}
                  initial={{ y: m ? '105%' : 0, opacity: m ? 1 : 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 1.1, delay: m ? 0.25 + i * 0.14 : 0, ease: EASE_OUT }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          {/* Slides in without fading from invisible: this paragraph is often the page's largest paint. */}
          <motion.p initial={{ y: 28 * m }} animate={{ y: 0 }} transition={{ duration: 0.9, delay: m ? 0.6 : 0, ease: EASE_OUT }} className="mt-7 max-w-[34rem] text-[length:var(--text-body-lg)] leading-relaxed text-white/75">
            {data.subheadline}
          </motion.p>
          <motion.div {...reveal(0.75)} className="mt-10 flex flex-wrap gap-3">
            <Link href={data.primaryCta.href} className="btn btn-accent min-h-13 px-7">{data.primaryCta.label}</Link>
            <Link href={data.secondaryCta.href} className="btn btn-ghost-inverse min-h-13 px-7">{data.secondaryCta.label}</Link>
          </motion.div>
        </div>
      </div>

      {/* Live listings as architectural annotations over the scene (desktop only). */}
      {data.showFloatingCards && highlights.length > 0 && (
        <div className="pointer-events-none absolute inset-0 z-10 hidden xl:block" aria-label="Highlighted listings">
          {highlights.slice(0, 2).map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 16 * m }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, delay: m ? 2.2 + i * 0.25 : 0, ease: EASE_OUT }}
              className="pointer-events-auto absolute flex items-center gap-3"
              style={i === 0 ? { right: '4%', top: '19%' } : { right: '30%', top: '70%' }}
            >
              <span aria-hidden="true" className="relative grid size-3 place-items-center">
                <span className="absolute size-3 animate-ping rounded-full bg-accent/50 [animation-duration:2.6s]" />
                <span className="size-1.5 rounded-full bg-accent" />
              </span>
              <span aria-hidden="true" className="h-px w-10 bg-accent/60" />
              <Link
                href={`/properties/${p.slug}`}
                className="group w-60 rounded-2xl border border-white/15 bg-primary/55 p-4 backdrop-blur-md transition-colors hover:border-accent/60"
              >
                <span className="flex items-center gap-1.5 text-xs text-white/60">
                  <MapPin className="size-3" aria-hidden="true" />
                  {p.location.locality}, {p.location.city}
                </span>
                <span className="mt-1 block font-heading text-[0.9375rem] font-semibold leading-snug text-white">{p.title}</span>
                <span className="mt-2 flex items-baseline justify-between">
                  <span className="font-heading text-lg font-bold text-accent">{formatPrice(p.price, p.priceUnit, p.currency)}</span>
                  <span className="text-xs text-white/60">{p.bhk ? `${p.bhk} BHK · ` : ''}{new Intl.NumberFormat('en-IN').format(p.areaSqft)} sq ft</span>
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <motion.a
        href="#search"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: m ? 2.6 : 0, duration: 0.8 }}
        className="absolute right-[var(--gutter)] bottom-48 z-10 hidden flex-col items-center gap-2 text-xs text-white/55 [writing-mode:vertical-rl] hover:text-white lg:flex"
      >
        Scroll to explore
        <ArrowDown className="size-4 motion-safe:animate-bounce [animation-duration:2.4s]" aria-hidden="true" />
      </motion.a>
    </section>
  );
}
