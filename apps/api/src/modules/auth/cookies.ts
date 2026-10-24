import type { CookieOptions, Request, Response } from 'express';
import { loadEnv } from '../../config/env.js';

/**
 * Cookie layout (all set on the tenant's own domain via the same-origin Next.js proxy):
 *  - access  (HttpOnly, Lax)    short-lived JWT, sent with every admin request
 *  - refresh (HttpOnly, Strict) opaque token, only useful against /auth/refresh
 *  - csrf    (readable, Strict) double-submit token the admin UI echoes in X-CSRF-Token
 * With HTTPS the names use the __Host- prefix, which pins them to the exact host and path "/".
 */
function secure() {
  const env = loadEnv();
  return env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production';
}

export function cookieNames() {
  const p = secure() ? '__Host-' : '';
  return { access: `${p}es_at`, refresh: `${p}es_rt`, csrf: `${p}es_csrf` };
}

function base(httpOnly: boolean, sameSite: 'lax' | 'strict'): CookieOptions {
  return { httpOnly, sameSite, secure: secure(), path: '/' };
}

export function setAuthCookies(res: Response, tokens: { access: string; refresh: string; accessTtlSec: number; refreshExpires: Date }) {
  const n = cookieNames();
  res.cookie(n.access, tokens.access, { ...base(true, 'lax'), maxAge: tokens.accessTtlSec * 1000 });
  res.cookie(n.refresh, tokens.refresh, { ...base(true, 'strict'), expires: tokens.refreshExpires });
}

export function clearAuthCookies(res: Response) {
  const n = cookieNames();
  res.clearCookie(n.access, base(true, 'lax'));
  res.clearCookie(n.refresh, base(true, 'strict'));
}

export function setCsrfCookie(res: Response, token: string) {
  res.cookie(cookieNames().csrf, token, { ...base(false, 'strict'), maxAge: 7 * 86400 * 1000 });
}

export function readCookie(req: Request, name: string): string | undefined {
  const v = (req.cookies as Record<string, string> | undefined)?.[name];
  return typeof v === 'string' && v.length > 0 && v.length < 4096 ? v : undefined;
}
