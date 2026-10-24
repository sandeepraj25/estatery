import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { PublicAgent, PublicProject, PublicProperty } from '@estatery/shared';
import { getSiteConfig } from '@/lib/api';
import { adminData } from '@/lib/admin-api';
import type { EditablePropertyDto } from '@/components/admin/property-editor';
import { PropertyDetailView } from '@/components/property/property-detail-view';
import { Forbidden } from '@/components/admin/ui';

export const metadata = { title: 'Preview listing', robots: { index: false } };

/** Shows any listing (including drafts) exactly as the public page will render it. */
export default async function PreviewProperty({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const [res, agents, projects, { settings }] = await Promise.all([
    adminData<EditablePropertyDto>(`admin/properties/${id}`),
    adminData<{ items: Array<PublicAgent & { id: string }> }>('admin/library/agents'),
    adminData<{ items: Array<PublicProject & { id: string }> }>('admin/library/projects'),
    getSiteConfig(),
  ]);
  if (!res.ok) return res.status === 404 ? notFound() : <Forbidden message={res.message} />;
  const d = res.data;
  const agent = agents.ok ? agents.data.items.find((a) => a.id === d.agentId) : undefined;
  const project = projects.ok ? projects.data.items.find((p) => p.id === d.projectId) : undefined;
  const property: PublicProperty = {
    id: d.id, slug: d.slug, title: d.title, summary: d.summary, description: d.description, listingType: d.listingType, category: d.category,
    type: d.type, status: d.status, price: d.price, priceUnit: d.listingType === 'rent' ? 'month' : 'total', currency: settings.currency,
    bhk: d.bhk, bathrooms: d.bathrooms, areaSqft: d.areaSqft, location: d.location, amenities: d.amenities, images: d.images,
    badges: { featured: d.featured, verified: d.verified, isNew: !d.publishedAt || Date.now() - new Date(d.publishedAt).getTime() < 21 * 86400_000 },
    project: project ? { name: project.name, slug: project.slug } : null,
    agent: agent ? { id: agent.id, name: agent.name, title: agent.title, phone: agent.phone, email: agent.email, photoUrl: agent.photoUrl } : null,
    publishedAt: d.publishedAt,
  };
  return (
    <div className="bg-ivory">
      <div role="status" className="sticky top-0 z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-accent px-4 py-2.5 text-sm font-semibold text-primary">
        <span>Preview{d.status !== 'published' ? ` — this listing is ${d.status} and not visible to visitors` : ' of the live listing'}{d.publishProblems.length ? '' : ''}</span>
        <Link href={`/admin/properties/${d.id}`} className="underline underline-offset-4">Back to editor</Link>
      </div>
      <div className="-mt-12">
        <PropertyDetailView p={property} similar={[]} settings={settings} preview />
      </div>
    </div>
  );
}
