import Link from 'next/link';
import type { PublicSiteConfig, SiteSettings } from '@estatery/shared';
import { Logo } from './logo';

const NETWORK_LABEL: Record<SiteSettings['social'][number]['network'], string> = {
  instagram: 'Instagram', linkedin: 'LinkedIn', youtube: 'YouTube', facebook: 'Facebook', x: 'X',
};

export function SiteFooter({ settings, pages }: { settings: SiteSettings; pages?: PublicSiteConfig['pages'] }) {
  const year = new Date().getFullYear();
  const { contact } = settings;
  return (
    <footer className="surface-dark relative overflow-hidden">
      <div className="container-site pt-20 pb-10">
        <div className="grid gap-14 lg:grid-cols-[1.3fr_2fr]">
          <div className="max-w-sm">
            <Logo settings={settings} className="text-white" />
            <p className="mt-5 text-muted">{settings.tagline}</p>
            <address className="mt-8 space-y-2 not-italic text-[0.9375rem] text-white/85">
              <p className="text-muted">{contact.address}</p>
              <p><a className="hover:text-accent" href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a></p>
              <p><a className="hover:text-accent" href={`mailto:${contact.email}`}>{contact.email}</a></p>
              <p className="text-muted">{contact.hours}</p>
            </address>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {settings.footerColumns.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <h2 className="font-heading text-sm font-semibold text-white">{col.title}</h2>
                <ul className="mt-4 space-y-2.5 text-[0.9375rem]">
                  {col.links.map((l) => (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className="text-muted transition-colors hover:text-white">{l.label}</Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        {/* Decorative watermark drawn with CSS content, so it isn't text for assistive tech or audits. */}
        <div aria-hidden="true" data-watermark={settings.logoText} className="type-display pointer-events-none mt-20 select-none whitespace-nowrap text-[clamp(4rem,14vw,13rem)] leading-[0.8] text-white/[0.06] before:content-[attr(data-watermark)]" />

        <div className="mt-6 flex flex-col gap-4 border-t border-white/12 pt-6 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <p>© {year} {settings.businessName}. All rights reserved.</p>
            {(pages?.privacy || pages?.terms) && (
              <ul className="flex gap-5">
                {pages?.privacy && <li><Link href="/privacy" className="hover:text-white">Privacy</Link></li>}
                {pages?.terms && <li><Link href="/terms" className="hover:text-white">Terms</Link></li>}
              </ul>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {settings.social.map((s) => (
              <li key={s.network}>
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:text-white">{NETWORK_LABEL[s.network]}</a>
              </li>
            ))}
          </ul>
          {settings.showPlatformBranding && <p className="text-white/70">Powered by Estatery</p>}
        </div>
      </div>
    </footer>
  );
}
