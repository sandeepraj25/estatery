import { NextResponse, type NextRequest } from 'next/server';
import { normalizeRedirectPath, type RedirectRule } from '@estatery/shared';

/**
 * Admin route gate (Next.js 16 "proxy", formerly middleware).
 *
 * - Signed-out visitors are sent to /admin/login.
 * - An expired or nearly expired access token is refreshed here, before the page renders, so
 *   server components always see a valid session. New cookies are applied to both the browser
 *   response and the in-flight request.
 * This is a convenience layer: the API still authenticates and authorises every call.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const KEY = process.env.API_INTERNAL_KEY ?? '';
const PUBLIC = ['/admin/login', '/admin/forgot-password', '/admin/reset-password', '/admin/accept-invite'];

/**
 * Host → main-domain routing cache. Once an agency's custom domain is verified, has HTTPS and is
 * set as primary, visits on its other addresses get a permanent redirect to it (good for SEO and
 * for cookies). Platform subdomains never force a redirect on their own.
 */
interface Routing { redirectTo: string | null; rules: Map<string, RedirectRule> }
const routingCache = new Map<string, Routing & { expires: number }>();
/** Also carries the agency's redirects for old addresses (see Website → Redirects). */
async function routing(host: string): Promise<Routing> {
  const hit = routingCache.get(host);
  if (hit && hit.expires > Date.now()) return hit;
  const r: Routing = { redirectTo: null, rules: new Map() };
  try {
    const res = await fetch(`${API_URL}/v1/site/routing`, { cache: 'no-store', headers: { 'x-internal-key': KEY, 'x-tenant-host': host }, signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      const body = (await res.json()) as { redirectTo: string | null; redirects?: RedirectRule[] };
      r.redirectTo = body.redirectTo;
      for (const rule of body.redirects ?? []) r.rules.set(rule.from, rule);
    }
  } catch {
    /* API slow or down: serve the page rather than block on routing */
  }
  routingCache.set(host, { ...r, expires: Date.now() + 60_000 });
  if (routingCache.size > 2000) routingCache.delete(routingCache.keys().next().value!);
  return r;
}

function cookie(req: NextRequest, base: string) {
  return req.cookies.get(`__Host-${base}`)?.value ?? req.cookies.get(base)?.value;
}

function expiresSoon(jwt: string | undefined) {
  if (!jwt) return true;
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return !payload.exp || payload.exp * 1000 - Date.now() < 30_000;
  } catch {
    return true;
  }
}

function toLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = req.nextUrl.pathname === '/admin' ? '' : `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
  return NextResponse.redirect(url);
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Homepage preview for the website editor: mark the request so layouts load the draft.
  // The draft itself is only returned by the API to signed-in editors; anyone else gets the live site.
  if (!pathname.startsWith('/admin')) {
    const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').toLowerCase();
    const preview = req.nextUrl.searchParams.get('preview') === 'draft';
    const route = preview ? null : await routing(host);
    const target = route?.redirectTo;
    if (target && target !== host.replace(/:\d+$/, '')) {
      return NextResponse.redirect(`https://${target}${pathname}${req.nextUrl.search}`, 308);
    }
    const rule = route?.rules.get(normalizeRedirectPath(pathname));
    if (rule) {
      const to = rule.to.startsWith('/') ? new URL(rule.to, req.nextUrl.origin) : rule.to;
      return NextResponse.redirect(to, rule.permanent ? 301 : 302);
    }
    const headers = new Headers(req.headers);
    headers.delete('x-estatery-preview');
    if (req.nextUrl.searchParams.get('preview') === 'draft') headers.set('x-estatery-preview', 'draft');
    return NextResponse.next({ request: { headers } });
  }
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();

  if (!expiresSoon(cookie(req, 'es_at'))) return NextResponse.next();
  const refresh = cookie(req, 'es_rt');
  if (!refresh) return toLogin(req);

  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '';
  const csrf = cookie(req, 'es_csrf') ?? crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const csrfName = req.cookies.has('__Host-es_csrf') ? '__Host-es_csrf' : 'es_csrf';
  let upstream: Response;
  try {
    upstream = await fetch(`${API_URL}/v1/auth/refresh`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        cookie: `${req.headers.get('cookie') ?? ''}; ${csrfName}=${csrf}`,
        'x-csrf-token': csrf,
        'x-internal-key': KEY,
        'x-tenant-host': host,
        'user-agent': req.headers.get('user-agent') ?? '',
      },
    });
  } catch {
    return NextResponse.next(); // API unreachable: let the page render its own error state
  }
  if (upstream.status === 409) return NextResponse.next(); // another tab is refreshing right now
  if (!upstream.ok) {
    const res = toLogin(req);
    for (const c of upstream.headers.getSetCookie()) res.headers.append('set-cookie', c);
    return res;
  }

  // Apply the rotated cookies to this request (for server rendering) and to the browser.
  const setCookies = upstream.headers.getSetCookie();
  const reqCookies = new Map(req.cookies.getAll().map((c) => [c.name, c.value]));
  for (const c of setCookies) {
    const [pair] = c.split(';');
    const i = pair!.indexOf('=');
    reqCookies.set(pair!.slice(0, i), pair!.slice(i + 1));
  }
  const forwarded = new Headers(req.headers);
  forwarded.set('cookie', [...reqCookies].map(([k, v]) => `${k}=${v}`).join('; '));
  const res = NextResponse.next({ request: { headers: forwarded } });
  for (const c of setCookies) res.headers.append('set-cookie', c);
  return res;
}

// Every page except framework assets, API routes, uploaded media and static files. Old-site
// addresses like /about-us.html or /listing.php still pass through, so redirects can catch them.
export const config = { matcher: ['/((?!_next/|api/|media/|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|map|txt|xml|json|woff2?|webmanifest)$).*)'] };
