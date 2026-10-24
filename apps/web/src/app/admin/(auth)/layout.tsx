import type { ReactNode } from 'react';
import { getSiteConfig } from '@/lib/api';

/** Split layout for sign-in pages: the agency's brand on the left, the form on the right. */
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const { settings } = await getSiteConfig();
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="surface-dark relative hidden flex-col justify-between overflow-hidden p-12 lg:flex">
        <p className="font-heading text-xl font-bold tracking-tight">{settings.businessName}</p>
        <div>
          <p className="type-display text-5xl leading-[1.05]">Your website, listings and enquiries — in one place.</p>
          <p className="mt-6 max-w-md text-muted">{settings.tagline}</p>
        </div>
        <p className="text-sm text-muted">Need help signing in? Contact your site owner.</p>
        <div aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border border-accent/20" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-8 size-64 rounded-full border border-accent/15" />
      </div>
      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <p className="mb-8 font-heading text-lg font-bold tracking-tight lg:hidden">{settings.businessName}</p>
          {children}
        </div>
      </div>
    </main>
  );
}
