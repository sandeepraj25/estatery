import { adminData } from '@/lib/admin-api';
import { RedirectsManager, type RedirectRow } from '@/components/admin/redirects-manager';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Redirects' };

export default async function RedirectsPage() {
  const res = await adminData<{ items: RedirectRow[]; max: number }>('admin/redirects');
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Redirects" description="Send addresses from your old website to the right pages here, so bookmarks and search results keep working. Changes apply within a minute." />
      <RedirectsManager items={res.data.items} max={res.data.max} />
    </>
  );
}
