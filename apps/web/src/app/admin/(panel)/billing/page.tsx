import type { BillingOverview } from '@estatery/shared';
import { getSiteConfig } from '@/lib/api';
import { adminData } from '@/lib/admin-api';
import { BillingPanel } from '@/components/admin/billing/billing-panel';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Plan & billing' };

export default async function BillingPage() {
  const [res, { settings }] = await Promise.all([adminData<BillingOverview>('admin/billing'), getSiteConfig()]);
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Plan & billing" description="Your plan, what you’re using and every payment. Only owners can see this page." />
      <BillingPanel data={res.data} businessName={settings.businessName} />
    </>
  );
}
