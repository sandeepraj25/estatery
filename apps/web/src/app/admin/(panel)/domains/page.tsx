import type { DomainDto } from '@estatery/shared';
import { adminData } from '@/lib/admin-api';
import { DomainsManager } from '@/components/admin/domains-manager';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Domains' };

export default async function DomainsPage() {
  const res = await adminData<{ items: DomainDto[] }>('admin/domains');
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Domains" description="Show your website on your own web address. HTTPS certificates are issued and renewed automatically." />
      <DomainsManager initial={res.data.items} />
    </>
  );
}
