import Link from 'next/link';
import { adminData, requireUser } from '@/lib/admin-api';
import { PropertyEditor } from '@/components/admin/property-editor';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'New listing' };

export default async function NewPropertyPage() {
  const user = await requireUser();
  if (!user.permissions.includes('properties:write')) return <Forbidden message="Your role can view listings but not create them." />;
  const [agents, projects] = await Promise.all([
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/agents'),
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/projects'),
  ]);
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/properties" className="hover:text-ink">Properties</Link> / New</nav>
      <PageHeader title="New listing" description="Start with the basics. It stays a private draft until you publish it." />
      <PropertyEditor initial={null} agents={agents.ok ? agents.data.items : []} projects={projects.ok ? projects.data.items : []} canEdit />
    </>
  );
}
