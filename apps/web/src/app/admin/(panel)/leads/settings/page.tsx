import Link from 'next/link';
import type { CrmSettings } from '@estatery/shared';
import { adminData } from '@/lib/admin-api';
import { CrmSettingsForm } from '@/components/admin/crm/crm-settings-form';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Lead notifications' };

export default async function CrmSettingsPage() {
  const [res, mail] = await Promise.all([adminData<CrmSettings>('admin/crm/settings'), adminData<{ configured: boolean }>('admin/crm/settings/email-status')]);
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/leads" className="hover:text-ink">Leads</Link> / Notifications</nav>
      <PageHeader title="Lead notifications" description="Decide who is told about new enquiries and how they’re shared out." />
      <CrmSettingsForm initial={res.data} emailConfigured={mail.ok ? mail.data.configured : true} />
    </>
  );
}
