import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSiteConfig } from '@/lib/api';
import { adminData, requireUser } from '@/lib/admin-api';
import { LeadDetail } from '@/components/admin/crm/lead-detail';
import type { LeadDetail as Detail } from '@/components/admin/crm/types';
import { Forbidden, LeadStatusBadge, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Lead' };

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const [user, res, { settings }] = await Promise.all([requireUser(), adminData<Detail>(`admin/leads/${id}`), getSiteConfig()]);
  if (!res.ok) return res.status === 404 ? notFound() : <Forbidden message={res.message} />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/leads" className="hover:text-ink">Leads</Link> / {res.data.lead.name}</nav>
      <PageHeader title={res.data.lead.name} actions={<LeadStatusBadge status={res.data.lead.status} />} />
      <LeadDetail key={res.data.activity[0]?.id ?? id} initial={res.data} user={user} businessName={settings.businessName} />
    </>
  );
}
