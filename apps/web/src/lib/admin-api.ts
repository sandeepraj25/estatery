import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { SessionUser } from '@estatery/shared';
import { ApiError } from './api';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const KEY = process.env.API_INTERNAL_KEY ?? '';

/** Server-side admin API call carrying the visitor's session cookies. */
export async function adminFetch<T>(path: string): Promise<T> {
  const h = await headers();
  const jar = await cookies();
  const res = await fetch(`${API_URL}/v1/${path}`, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      cookie: jar.getAll().map((c) => `${c.name}=${c.value}`).join('; '),
      'x-internal-key': KEY,
      'x-tenant-host': h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost',
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'API_ERROR', e.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

/** The signed-in user, or a redirect to sign-in. Deduplicated per request. */
export const requireUser = cache(async (): Promise<SessionUser> => {
  try {
    return await adminFetch<SessionUser>('auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) redirect('/admin/login');
    throw e;
  }
});

/** Runs an admin fetch and turns 401/403 into redirects or a friendly forbidden state. */
export async function adminData<T>(path: string): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    return { ok: true, data: await adminFetch<T>(path) };
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 401) redirect('/admin/login');
      return { ok: false, status: e.status, message: e.message };
    }
    throw e;
  }
}
