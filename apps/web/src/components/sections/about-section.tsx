import Link from 'next/link';
import type { HomeSection } from '@estatery/shared';
import { RevealImage } from '@/components/site/reveal-image';

type Data = Extract<HomeSection, { type: 'about' }>['data'];

export function AboutSection({ data }: { data: Data }) {
  return (
    <section id="about" aria-labelledby="about-title" className="section bg-white">
      <div className="container-site grid items-center gap-16 lg:grid-cols-2 lg:gap-24">
        <div className="relative pb-16 pr-10 sm:pr-24">
          <RevealImage src={data.image} alt="" sizes="(min-width:1024px) 45vw, 100vw" className="aspect-[4/5] rounded-[var(--radius-card)]" />
          <RevealImage
            src={data.secondaryImage}
            alt=""
            sizes="(min-width:1024px) 20vw, 45vw"
            className="absolute bottom-0 right-0 aspect-square w-[46%] rounded-[var(--radius-card)] ring-[10px] ring-white"
          />
        </div>

        <div>
          {data.eyebrow && <p className="kicker">{data.eyebrow}</p>}
          <h2 id="about-title" className="type-display type-section mt-4">{data.title}</h2>
          <p className="mt-7 max-w-xl text-[length:var(--text-body-lg)] leading-relaxed text-muted">{data.body}</p>

          {data.metrics.length > 0 && (
            <dl className="mt-12 grid grid-cols-2 border-t border-line">
              {data.metrics.map((m, i) => (
                <div key={m.label} className={`border-b border-line py-6 ${i % 2 === 0 ? 'pr-6' : 'border-l pl-6'}`}>
                  <dt className="sr-only">{m.label}</dt>
                  <dd>
                    <span className="block font-heading text-[clamp(1.75rem,1.4rem+1.2vw,2.5rem)] font-bold tracking-tight text-ink">{m.value}</span>
                    <span className="mt-1 block text-sm text-muted">{m.label}</span>
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <Link href={data.cta.href} className="btn btn-primary mt-10">{data.cta.label}</Link>
        </div>
      </div>
    </section>
  );
}
