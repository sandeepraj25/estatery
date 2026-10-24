import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/** Top of every content page: breadcrumb, title and intro, clear of the overlaid site header. */
export function PageHeader({ title, intro, crumb, kicker, children, className }: {
  title: string; intro?: string; crumb: string; kicker?: string; children?: ReactNode; className?: string;
}) {
  return (
    <header className={cn('container-site pt-32 pb-12 sm:pb-16', className)}>
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap gap-2">
          <li><Link href="/" className="hover:text-ink">Home</Link></li>
          <li aria-hidden="true">/</li>
          <li aria-current="page">{crumb}</li>
        </ol>
      </nav>
      {kicker && <p className="kicker mt-8">{kicker}</p>}
      <h1 className={cn('type-display type-section max-w-4xl', kicker ? 'mt-4' : 'mt-6')}>{title}</h1>
      {intro && <p className="mt-5 max-w-2xl text-[length:var(--text-body-lg)] text-muted">{intro}</p>}
      {children}
    </header>
  );
}
