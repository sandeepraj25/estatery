import type { ReactNode } from 'react';
import { getSiteConfig } from '@/lib/api';
import type { BillingSummary } from '@estatery/shared';
import { adminData, requireUser } from '@/lib/admin-api';
import { AdminShell } from '@/components/admin/admin-shell';
import { BillingBanner } from '@/components/admin/billing/billing-banner';

export const dynamic = 'force-dynamic';

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const [user, { settings }, billing] = await Promise.all([requireUser(), getSiteConfig(), adminData<BillingSummary>('admin/billing/summary')]);
  const banner = billing.ok ? <BillingBanner summary={billing.data} canManage={user.permissions.includes('billing:manage')} /> : null;
  return <AdminShell user={user} businessName={settings.businessName} banner={banner}>{children}</AdminShell>;
}
