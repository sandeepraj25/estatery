import { adminData } from '@/lib/admin-api';
import type { MediaItem } from '@/lib/admin-client';
import { MediaLibrary } from '@/components/admin/media-library';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const res = await adminData<{ items: MediaItem[]; totalPages: number }>('admin/media?page=1');
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Media" description="Every image uploaded to your site." />
      <MediaLibrary initial={res.data.items} totalPages={res.data.totalPages} />
    </>
  );
}
