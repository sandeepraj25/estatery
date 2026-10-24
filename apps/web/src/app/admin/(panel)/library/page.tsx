import Link from 'next/link';
import { adminData, requireUser } from '@/lib/admin-api';
import { LibraryManager } from '@/components/admin/library-manager';
import { LIBRARY_TABS, type Kind } from '@/components/admin/library-tabs';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Content library' };

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const kind: Kind = LIBRARY_TABS.some((t) => t.kind === tab) ? (tab as Kind) : 'agents';
  const [user, res] = await Promise.all([requireUser(), adminData<{ items: Array<Record<string, unknown> & { id: string }> }>(`admin/library/${kind}`)]);
  if (!res.ok) return <Forbidden message={res.message} />;
  return (
    <>
      <PageHeader title="Content library" description="People, stories, places and projects your homepage draws from." />
      <nav aria-label="Content type" className="mb-5 flex gap-1 border-b border-line">
        {LIBRARY_TABS.map((t) => (
          <Link key={t.kind} href={`/admin/library?tab=${t.kind}`} aria-current={kind === t.kind ? 'page' : undefined} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${kind === t.kind ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink'}`}>{t.label}</Link>
        ))}
      </nav>
      <LibraryManager key={kind} kind={kind} items={res.data.items} canEdit={user.permissions.includes('content:write')} />
    </>
  );
}
