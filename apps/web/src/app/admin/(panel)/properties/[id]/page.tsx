import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminData, requireUser } from '@/lib/admin-api';
import { PropertyEditor, type EditablePropertyDto } from '@/components/admin/property-editor';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Edit listing' };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const user = await requireUser();
  const [res, agents, projects] = await Promise.all([
    adminData<EditablePropertyDto>(`admin/properties/${id}`),
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/agents'),
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/projects'),
  ]);
  if (!res.ok) {
    if (res.status === 404) notFound();
    return <Forbidden message={res.message} />;
  }
  const canEdit = user.permissions.includes('properties:write');
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/properties" className="hover:text-ink">Properties</Link> / {res.data.title}</nav>
      <PageHeader title={res.data.title} description={canEdit ? undefined : 'You can view this listing. Your role can’t edit it.'} />
      <PropertyEditor key={res.data.updatedAt} initial={res.data} agents={agents.ok ? agents.data.items : []} projects={projects.ok ? projects.data.items : []} canEdit={canEdit} />
    </>
  );
}
