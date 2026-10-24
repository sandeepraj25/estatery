import type { HomeSection } from '@estatery/shared';
import { SearchPanel } from '@/components/site/search-panel';

type Data = Extract<HomeSection, { type: 'search' }>['data'];

/** Docks into the bottom edge of the hero so search is visible on first load. */
export function SearchSection({ data, cities, docked }: { data: Data; cities: string[]; docked: boolean }) {
  return (
    <section id="search" aria-label="Search properties" className={docked ? 'relative z-20 -mt-36 sm:-mt-32' : 'section'}>
      <div className="container-site">
        <div className="mx-auto max-w-6xl">
          <SearchPanel cities={cities} popular={data.popularSearches} title={data.title} />
        </div>
      </div>
    </section>
  );
}
