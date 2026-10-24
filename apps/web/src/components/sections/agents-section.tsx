import { Mail, Phone } from 'lucide-react';
import { SafeImage as Image } from '@/components/ui/safe-image';
import type { HomeSection, PublicAgent } from '@estatery/shared';
import { SectionHeading } from './section-heading';

type Data = Extract<HomeSection, { type: 'agents' }>['data'];

export function AgentsSection({ data, agents }: { data: Data; agents: PublicAgent[] }) {
  if (agents.length === 0) return null;
  return (
    <section id="advisors" aria-labelledby="agents-title" className="section bg-white">
      <div className="container-site">
        <SectionHeading id="agents-title" kicker={data.eyebrow} title={data.title} subtitle={data.subtitle} />
      </div>
      {/* Horizontal row that bleeds to the viewport edge; snaps on touch devices. */}
      <ul className="hide-scrollbar mt-14 flex snap-x snap-mandatory gap-5 overflow-x-auto px-[max(var(--gutter),calc((100vw_-_var(--content-max))/2_+_var(--gutter)))] scroll-px-[var(--gutter)] pb-4" aria-label="Advisors">
        {agents.map((a) => (
          <li key={a.id} className="w-[17.5rem] shrink-0 snap-start sm:w-[19rem]">
            <article>
              <div className="media-fallback relative aspect-[4/5] overflow-hidden rounded-[var(--radius-card)]">
                <Image src={a.photoUrl} alt={`Portrait of ${a.name}`} fill sizes="19rem" className="object-cover grayscale-[35%] transition duration-700 hover:grayscale-0" />
              </div>
              <h3 className="mt-5 font-heading text-lg font-semibold">{a.name}</h3>
              <p className="text-sm text-muted">{a.title}</p>
              <p className="mt-3 text-sm text-ink/80">
                {a.yearsExperience} years · {a.languages.join(', ')}
              </p>
              <div className="mt-4 flex gap-2">
                <a href={`tel:${a.phone.replace(/\s/g, '')}`} className="btn btn-ghost min-h-10 px-4 text-sm" aria-label={`Call ${a.name}`}>
                  <Phone className="size-4" aria-hidden="true" /> Call
                </a>
                <a href={`mailto:${a.email}`} className="btn btn-ghost min-h-10 px-4 text-sm" aria-label={`Email ${a.name}`}>
                  <Mail className="size-4" aria-hidden="true" /> Email
                </a>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
