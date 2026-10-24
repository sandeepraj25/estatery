import type { ReactNode } from 'react';
import { cn } from '@/lib/format';

/** Shared heading block: optional kicker, display title, optional subtitle and trailing action. */
export function SectionHeading({
  id, kicker, title, subtitle, action, className, align = 'split',
}: { id: string; kicker?: string; title: string; subtitle?: string; action?: ReactNode; className?: string; align?: 'split' | 'stack' }) {
  return (
    <div className={cn('flex flex-col gap-6', align === 'split' && 'lg:flex-row lg:items-end lg:justify-between', className)}>
      <div className="max-w-2xl">
        {kicker && <p className="kicker">{kicker}</p>}
        <h2 id={id} className="type-display type-section mt-4">{title}</h2>
      </div>
      {(subtitle || action) && (
        <div className="flex max-w-md flex-col items-start gap-5 lg:items-end lg:text-right">
          {subtitle && <p className="text-muted">{subtitle}</p>}
          {action}
        </div>
      )}
    </div>
  );
}
