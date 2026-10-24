import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ApiError, getProperty, getSiteConfig } from '@/lib/api';
import { formatPrice } from '@/lib/format';
import { PropertyDetailView } from '@/components/property/property-detail-view';

type Params = Promise<{ slug: string }>;

async function load(slug: string) {
  if (!/^[a-z0-9-]{3,120}$/i.test(slug)) notFound();
  let res;
  try {
    res = await getProperty(slug);
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
  // Renamed listing: send visitors and search engines to the current URL.
  if ('redirectTo' in res) permanentRedirect(`/properties/${res.redirectTo}`);
  return res;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const { property: p } = await load(slug);
  const img = p.images[0]?.url;
  return {
    title: `${p.title} — ${formatPrice(p.price, p.priceUnit, p.currency)}`,
    description: p.summary || p.description.slice(0, 160),
    alternates: { canonical: `/properties/${p.slug}` },
    openGraph: { title: p.title, description: p.summary, images: img ? [{ url: img }] : undefined, type: 'website' },
  };
}

export default async function PropertyPage({ params }: { params: Params }) {
  const { slug } = await params;
  const [{ property, similar }, { settings }] = await Promise.all([load(slug), getSiteConfig()]);
  return <PropertyDetailView p={property} similar={similar} settings={settings} />;
}
