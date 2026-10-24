import '@fontsource-variable/inter';
import '@fontsource-variable/manrope';
import '@fontsource-variable/playfair-display';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ApiError, getSiteConfig, visitorHost } from '@/lib/api';
import { themeToCss } from '@/lib/theme';
import { SiteUnavailable } from '@/components/site/site-unavailable';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { settings, canonicalHost } = await getSiteConfig();
    const host = await visitorHost();
    // Canonical URLs point at the main custom domain once it's live, whichever address was visited.
    const base = canonicalHost ? `https://${canonicalHost}` : `${/^(localhost|127\.|[^.]+\.localhost)/.test(host) ? 'http' : 'https'}://${host}`;
    return {
      metadataBase: new URL(base),
      title: { default: settings.seo.title, template: `%s · ${settings.businessName}` },
      description: settings.seo.description,
      alternates: { canonical: '/' },
      icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
      openGraph: {
        url: '/',
        siteName: settings.businessName,
        type: 'website',
        images: settings.seo.ogImage ? [{ url: settings.seo.ogImage }] : undefined,
      },
    };
  } catch {
    return { title: 'Site unavailable' };
  }
}

export const viewport: Viewport = { themeColor: '#10251D', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: ReactNode }) {
  let config;
  try {
    config = await getSiteConfig();
  } catch (err) {
    const code = err instanceof ApiError ? err.code : 'API_UNREACHABLE';
    return (
      <html lang="en">
        <body>
          <SiteUnavailable code={code} />
        </body>
      </html>
    );
  }
  const { settings, theme } = config;
  // Header/footer live in the (site) group layout; the Admin Panel has its own shell.
  return (
    <html lang={settings.locale.split('-')[0] ?? 'en'} data-motion={theme.motion.level}>
      <head>
        {/* Tenant theme tokens. Validated server-side, so safe to inline. */}
        <style id="tenant-theme" dangerouslySetInnerHTML={{ __html: themeToCss(theme) }} />
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-white focus:px-4 focus:py-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
