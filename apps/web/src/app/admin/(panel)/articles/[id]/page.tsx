import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminData } from '@/lib/admin-api';
import { ArticleEditor, type ArticleDto } from '@/components/admin/article-editor';
import { Forbidden, PageHeader } from '@/components/admin/ui';

export const metadata = { title: 'Edit article' };

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-f0-9]{24}$/.test(id)) notFound();
  const [res, list, agents] = await Promise.all([
    adminData<ArticleDto>(`admin/articles/${id}`),
    adminData<{ categories: string[] }>('admin/articles'),
    adminData<{ items: Array<{ id: string; name: string }> }>('admin/library/agents'),
  ]);
  if (!res.ok) return res.status === 404 ? notFound() : <Forbidden message={res.message} />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 text-sm text-muted"><Link href="/admin/articles" className="hover:text-ink">Articles</Link> / {res.data.title}</nav>
      <PageHeader title={res.data.title} />
      <ArticleEditor initial={res.data} authors={agents.ok ? agents.data.items : []} categories={list.ok ? list.data.categories : []} />
    </>
  );
}
