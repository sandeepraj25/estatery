'use client';

/**
 * Browser-side admin calls through the same-origin proxy. Adds the CSRF header from the readable
 * csrf cookie and transparently refreshes an expired access token once before giving up.
 */
export class AdminRequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Array<{ path: string; message: string }> = [],
    /** Checklist items, e.g. what's missing before a listing can be published. */
    public problems: string[] = [],
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)(?:__Host-)?es_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

/** Ensures a CSRF cookie exists (call before the first form submit on auth pages). */
export async function ensureCsrf() {
  if (!csrfToken()) await fetch('/api/admin/auth/csrf', { credentials: 'same-origin' });
}

let refreshing: Promise<boolean> | null = null;
function refreshSession(): Promise<boolean> {
  refreshing ??= fetch('/api/admin/auth/refresh', { method: 'POST', headers: { 'x-csrf-token': csrfToken() }, credentials: 'same-origin' })
    .then((r) => r.ok || r.status === 409)
    .catch(() => false)
    .finally(() => setTimeout(() => (refreshing = null), 0));
  return refreshing;
}

export async function adminRequest<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T> {
  await ensureCsrf();
  const res = await fetch(`/api/admin/${path}`, {
    method: init.method ?? 'GET',
    credentials: 'same-origin',
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      'x-csrf-token': csrfToken(),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith('auth/')) {
    if (await refreshSession()) return adminRequest<T>(path, init, false);
    window.location.href = `/admin/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new AdminRequestError(res.status, e.code ?? 'ERROR', e.message ?? 'Something went wrong. Please try again.', e.fields ?? [], e.problems ?? []);
  }
  return body as T;
}

export interface MediaItem { id: string; url: string; width: number; height: number; bytes: number; alt: string; originalName: string; createdAt: string }

/** Uploads one image. The API validates and re-encodes it; the browser checks are only for quick feedback. */
export async function uploadImage(file: File, alt = ''): Promise<MediaItem> {
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) {
    throw new AdminRequestError(400, 'INVALID_IMAGE', `“${file.name}” isn’t a supported image. Use JPG, PNG, WebP or AVIF.`);
  }
  if (file.size > 12 * 1024 * 1024) throw new AdminRequestError(413, 'FILE_TOO_LARGE', `“${file.name}” is larger than 12 MB.`);
  await ensureCsrf();
  const form = new FormData();
  form.append('file', file);
  if (alt) form.append('alt', alt);
  const send = () => fetch('/api/admin/admin/media', { method: 'POST', body: form, headers: { 'x-csrf-token': csrfToken() }, credentials: 'same-origin' });
  let res = await send();
  if (res.status === 401 && (await refreshSession())) res = await send();
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new AdminRequestError(res.status, e.code ?? 'ERROR', e.message ?? 'Upload failed. Please try again.');
  }
  return body as MediaItem;
}
