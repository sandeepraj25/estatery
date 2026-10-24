import type { ReactNode } from 'react';
import { getSiteConfig, isPreview } from '@/lib/api';
import { SiteFooter } from '@/components/site/site-footer';
import { SiteHeader } from '@/components/site/site-header';

export default async function SiteLayout({ children }: { children: ReactNode }) {
  const [{ settings, pages }, preview] = await Promise.all([getSiteConfig(), isPreview()]);
  return (
    <>
      {preview && (
        <div role="status" className="fixed inset-x-0 bottom-0 z-[90] flex items-center justify-center gap-3 bg-accent px-4 py-2 text-sm font-semibold text-primary">
          Preview of unpublished changes. Visitors still see the live site.
        </div>
      )}
      <SiteHeader settings={settings} />
      <main id="main">{children}</main>
      <SiteFooter settings={settings} pages={pages} />
    </>
  );
}
