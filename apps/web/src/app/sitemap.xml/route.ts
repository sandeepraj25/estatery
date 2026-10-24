import { getSitemap, siteOrigin } from '@/lib/api';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Per-agency sitemap: the hostname decides which agency's live pages are listed. */
export async function GET() {
  try {
    const [entries, origin] = await Promise.all([getSitemap(), siteOrigin()]);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${esc(origin + e.path)}</loc><lastmod>${e.lastModified}</lastmod><priority>${e.priority.toFixed(1)}</priority></url>`).join('\n')}
</urlset>
`;
    return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=900' } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
