import { adminData, requireUser } from '@/lib/admin-api';
import { PlatformTable, type TenantRow } from '@/components/admin/platform-table';
import { Forbidden, PageHeader, Panel } from '@/components/admin/ui';
import { NewAgency } from '@/components/admin/new-agency';

export const metadata = { title: 'All agencies' };

export default async function PlatformPage() {
  const user = await requireUser();
  const res = await adminData<{ items: TenantRow[] }>('platform/tenants');
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="All agencies" description="Every client site on the platform. Only platform operators can see this section; agency administrators never can." actions={<NewAgency platformDomain={process.env.PLATFORM_DOMAIN ?? 'localhost'} />} />
      <Panel><PlatformTable tenants={res.data.items} currentTenantId={user.tenant.id} /></Panel>
    </>
  );
}
