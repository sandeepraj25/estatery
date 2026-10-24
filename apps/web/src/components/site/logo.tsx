import Link from 'next/link';
import { SafeImage as Image } from '@/components/ui/safe-image';
import type { SiteSettings } from '@estatery/shared';

/** Tenant logo: uploaded image if set, otherwise a typographic wordmark. */
export function Logo({ settings, className = '' }: { settings: SiteSettings; className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-center gap-2.5 ${className}`} aria-label={`${settings.businessName} home`}>
      {settings.logoUrl ? (
        <Image src={settings.logoUrl} alt="" width={140} height={36} className="h-9 w-auto" />
      ) : (
        <>
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true" className="text-accent">
            <path d="M3 23V11L13 3l10 8v12" fill="none" stroke="currentColor" strokeWidth="1.6" />
            <path d="M9 23v-7h8v7" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="font-heading text-[1.2rem] font-bold tracking-[-0.02em]">{settings.logoText}</span>
        </>
      )}
    </Link>
  );
}
