import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPage } from '@/lib/api';
import { LegalPage } from '@/components/content/legal-page';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPage('terms');
  if (!page) return {};
  return { title: page.title, description: page.seoDescription || page.intro, alternates: { canonical: '/terms' } };
}

export default async function Page() {
  const page = await getPage('terms');
  if (!page) notFound();
  return <LegalPage crumb="Terms of use" title={page.title} intro={page.intro} body={page.body} lastUpdated={page.lastUpdated} />;
}
