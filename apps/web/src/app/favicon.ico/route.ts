/** Browsers and crawlers still ask for /favicon.ico; point them at the agency's icon. */
export function GET() {
  return new Response(null, { status: 308, headers: { location: '/icon.svg', 'cache-control': 'public, max-age=86400' } });
}
