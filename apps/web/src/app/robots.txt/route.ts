import { getSiteConfig, siteOrigin, visitorHost } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Per-agency robots.txt. Only the agency's main address is indexed; other addresses (the platform
 * subdomain once a custom domain is live) redirect there anyway. Unknown or suspended sites block all.
 */
export async function GET() {
  const text = (lines: string[]) => new Response(`${lines.join('\n')}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=900' } });
  try {
    const [{ canonicalHost }, origin, host] = await Promise.all([getSiteConfig(), siteOrigin(), visitorHost()]);
    if (canonicalHost && host.split(':')[0] !== canonicalHost) return text(['User-agent: *', 'Disallow: /']);
    return text(['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /api/', 'Disallow: /*?preview=', '', `Sitemap: ${origin}/sitemap.xml`]);
  } catch {
    return text(['User-agent: *', 'Disallow: /']);
  }
}
