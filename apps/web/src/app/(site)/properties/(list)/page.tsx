import type { Metadata } from 'next';
import Link from 'next/link';
import { PROPERTY_TYPE_LABELS, propertyQuerySchema, type PropertyQuery } from '@estatery/shared';
import { getCities, searchProperties } from '@/lib/api';
import { FilterBar } from '@/components/property/filter-bar';
import { PropertyCard } from '@/components/property/property-card';
import { ClientPropertyList } from '@/components/property/client-property-list';

type SP = Promise<Record<string, string | string[] | undefined>>;

function flatten(sp: Record<string, string | string[] | undefined>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const val = Array.isArray(v) ? v[0] : v;
    if (val !== undefined && val !== '') out.set(k, val);
  }
  return out;
}

/** "3 BHK villas for sale in Goa" — used for the H1, the <title> and the empty state. */
function describe(q: Partial<PropertyQuery>) {
  const kind = q.type ? `${PROPERTY_TYPE_LABELS[q.type]}s` : q.category === 'commercial' ? 'Commercial properties' : 'Homes';
  const bhk = q.bhk ? `${q.bhk}${q.bhk >= 5 ? '+' : ''} BHK ` : '';
  const lt = q.listingType === 'rent' ? ' for rent' : q.listingType === 'sale' ? ' for sale' : '';
  const where = q.city ? ` in ${q.city}` : '';
  const text = `${bhk}${kind}${lt}${where}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const parsed = propertyQuerySchema.safeParse(Object.fromEntries(flatten(await searchParams)));
  const title = parsed.success ? describe(parsed.data) : 'Properties';
  return { title, alternates: { canonical: '/properties' } };
}

export default async function PropertiesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const params = flatten(sp);
  const cities = await getCities();

  if (params.get('saved') === '1') {
    return (
      <>
        <PageIntro title="Saved homes" subtitle="Homes you’ve saved on this device." />
        <div className="container-site pb-24"><ClientPropertyList source="saved" /></div>
      </>
    );
  }

  // Invalid params (hand-edited URLs) are dropped rather than failing the whole page.
  let parsed = propertyQuerySchema.safeParse(Object.fromEntries(params));
  let ignored = false;
  if (!parsed.success) {
    for (const issue of parsed.error.issues) params.delete(String(issue.path[0]));
    parsed = propertyQuerySchema.safeParse(Object.fromEntries(params));
    ignored = true;
  }
  const query = parsed.success ? parsed.data : propertyQuerySchema.parse({});
  const results = await searchProperties(params);
  const heading = describe(query);

  const pageHref = (page: number) => {
    const next = new URLSearchParams(params);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    return `/properties?${next.toString()}`;
  };

  return (
    <>
      <PageIntro title={heading} subtitle={`${results.total} ${results.total === 1 ? 'property' : 'properties'} available`} />
      <FilterBar cities={cities} total={results.total} />

      <div className="container-site py-10 pb-24">
        {ignored && <p className="mb-6 rounded-lg bg-accent/15 px-4 py-3 text-sm">Some filters in the link weren’t recognised and were ignored.</p>}

        {results.items.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-line bg-white p-12 text-center">
            <p className="font-heading text-xl font-semibold">No matches for {heading.toLowerCase()}</p>
            <p className="mx-auto mt-2 max-w-md text-muted">Try a wider budget or another city — or ask an advisor about homes that aren’t publicly listed.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/properties" className="btn btn-primary">Clear all filters</Link>
              <Link href="/#contact" className="btn btn-ghost">Ask an advisor</Link>
            </div>
          </div>
        ) : (
          <>
            <h2 className="sr-only">Results</h2>
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {results.items.map((p, i) => (
                <li key={p.id}><PropertyCard property={p} priority={i < 3} /></li>
              ))}
            </ul>
            {results.totalPages > 1 && (
              <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-2">
                {results.page > 1 && <Link href={pageHref(results.page - 1)} className="btn btn-ghost min-h-11" rel="prev">Previous</Link>}
                {Array.from({ length: results.totalPages }, (_, i) => i + 1).map((n) => (
                  <Link
                    key={n}
                    href={pageHref(n)}
                    aria-current={n === results.page ? 'page' : undefined}
                    className={`grid size-11 place-items-center rounded-full text-sm font-semibold ${n === results.page ? 'bg-primary text-inverse' : 'hover:bg-line/60'}`}
                  >
                    {n}
                  </Link>
                ))}
                {results.page < results.totalPages && <Link href={pageHref(results.page + 1)} className="btn btn-ghost min-h-11" rel="next">Next</Link>}
              </nav>
            )}
          </>
        )}
      </div>
    </>
  );
}

function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="container-site pt-32 pb-8">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex gap-2"><li><Link href="/" className="hover:text-ink">Home</Link></li><li aria-hidden="true">/</li><li aria-current="page">Properties</li></ol>
      </nav>
      <h1 className="type-display type-section mt-4">{title}</h1>
      <p className="mt-3 text-muted">{subtitle}</p>
    </div>
  );
}
