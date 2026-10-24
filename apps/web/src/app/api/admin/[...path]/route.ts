import { NextResponse, type NextRequest } from 'next/server';

/**
 * Same-origin proxy for the Admin Panel ("backend for frontend").
 *
 * The browser only ever talks to its own origin (agency-a.com/api/admin/...). This route forwards
 * the request to the API with the visitor's hostname, IP and cookies, adds the server-only internal
 * key, and relays Set-Cookie back. Session cookies therefore live on the tenant's own domain, and
 * the API never needs to accept cross-origin browser traffic.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const KEY = process.env.API_INTERNAL_KEY ?? '';
/** Only these API areas are reachable through the proxy. */
const ALLOWED = /^(auth|admin|platform)\/[a-z0-9/._-]{1,200}$/i;
/** Request size limits: image uploads and CSV imports are larger than ordinary JSON calls. */
const LIMITS: Array<[RegExp, number]> = [
  [/^admin\/media$/, 13 * 1024 * 1024],
  [/^admin\/properties\/import$/, 2 * 1024 * 1024],
];
const DEFAULT_LIMIT = 256 * 1024;

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = path.join('/');
  if (!ALLOWED.test(target) || target.includes('..')) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, { status: 404 });
  }

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    // Defence in depth on top of the API's CSRF token: reject cross-site writes outright.
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== host) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-site request blocked.' } }, { status: 403 });
    }
  }

  const headers: Record<string, string> = {
    accept: 'application/json',
    'x-internal-key': KEY,
    'x-tenant-host': host,
  };
  for (const h of ['cookie', 'content-type', 'x-csrf-token', 'user-agent']) {
    const v = req.headers.get(h);
    if (v) headers[h] = v;
  }
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
  if (ip) headers['x-client-ip'] = ip;

  const limit = LIMITS.find(([rx]) => rx.test(target))?.[1] ?? DEFAULT_LIMIT;
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > limit) {
    return NextResponse.json({ error: { code: 'TOO_LARGE', message: 'That file is too large.' } }, { status: 413 });
  }
  // Raw bytes (not text) so multipart image uploads pass through intact.
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
  if (body && body.byteLength > limit) {
    return NextResponse.json({ error: { code: 'TOO_LARGE', message: 'That file is too large.' } }, { status: 413 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/${target}${req.nextUrl.search}`, { method: req.method, headers, body, cache: 'no-store', redirect: 'manual' });
  } catch {
    return NextResponse.json({ error: { code: 'API_UNREACHABLE', message: 'The service is unavailable. Please try again shortly.' } }, { status: 502 });
  }

  const res = new NextResponse(upstream.status === 204 ? null : await upstream.arrayBuffer(), { status: upstream.status });
  for (const h of ['content-type', 'content-disposition']) {
    const v = upstream.headers.get(h);
    if (v) res.headers.set(h, v);
  }
  for (const c of upstream.headers.getSetCookie()) res.headers.append('set-cookie', c);
  res.headers.set('cache-control', 'no-store');
  return res;
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
