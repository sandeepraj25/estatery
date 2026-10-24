import { getSiteConfig } from '@/lib/api';

export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Each agency's favicon: the first letter of its text logo in its own brand colours. */
export async function GET() {
  let letter = 'E';
  let bg = '#10251D';
  let fg = '#C6A66B';
  try {
    const { settings, theme } = await getSiteConfig();
    letter = (settings.logoText || settings.businessName).trim().charAt(0).toUpperCase() || 'E';
    bg = theme.colors.primary;
    fg = theme.colors.accent;
  } catch {
    /* unknown host: platform default */
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${esc(bg)}"/><text x="32" y="44" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="38" fill="${esc(fg)}">${esc(letter)}</text></svg>`;
  return new Response(svg, { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=3600' } });
}
