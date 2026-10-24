import Link from 'next/link';
import { adminData } from '@/lib/admin-api';
import { ArticleEditor } from '@/components/admin/article-editor';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'New article' };

export default async function NewArticlePage() {
  const [list, agents] = await Promise.all([
    adminData<{ categories: string[] }>('admin/articles'),
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/agents'),
  ]);
  if (!list.ok) return <Forbidden message={list.message} />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/articles" className="hover:text-ink">Articles</Link> / New</nav>
      <PageHeader title="New article" />
      <ArticleEditor initial={null} authors={agents.ok ? agents.data.items : []} categories={list.data.categories} />
    </>
  );
}
