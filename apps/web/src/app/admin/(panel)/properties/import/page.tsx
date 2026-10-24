import Link from 'next/link';
import { requireUser } from '@/lib/admin-api';
import { CsvImport } from '@/components/admin/csv-import';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Import listings' };

export default async function ImportPage() {
  const user = await requireUser();
  if (!user.permissions.includes('properties:write')) return <Forbidden message="Your role can’t import listings." />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/properties" className="hover:text-ink">Properties</Link> / Import</nav>
      <PageHeader title="Import listings from CSV" description="Move listings in from a spreadsheet or another system. New rows arrive as drafts so you can add photos before publishing." />
      <CsvImport />
    </>
  );
}
