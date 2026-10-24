import 'server-only';
import { cookies, headers } from 'next/headers';
import { cache } from 'react';
import type {
  PageKey, Paginated, PublicAgent, PublicArticle, PublicArticleDetail, PublicLocation, PublicProject, PublicProperty, PublicSiteConfig,
  PublicTestimonial, SitemapEntry, SitePages,
} from '@estatery/shared';

/**
 * Server-side API client. Every call forwards the visitor's hostname so the API resolves the
 * right tenant, authenticated with the internal key (never shipped to the browser).
 *
 * Responses are tenant-specific, so they are not put in Next's shared fetch cache: a cache keyed
 * only by URL could serve one agency's homepage on another agency's domain. Per-tenant tagged
 * caching is added together with the admin "publish" flow.
 */
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:4000';
const KEY = process.env.API_INTERNAL_KEY ?? '';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Array<{ path: string; message: string }>) {
    super(message);
  }
}

export async function visitorHost(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost';
}

export async function apiFetch<T>(path: string, init: RequestInit & { clientIp?: string } = {}): Promise<T> {
  const host = await visitorHost();
  const { clientIp, ...rest } = init;
  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      ...(rest.body ? { 'content-type': 'application/json' } : {}),
      'x-internal-key': KEY,
      'x-tenant-host': host,
      ...(clientIp ? { 'x-client-ip': clientIp } : {}),
      ...rest.headers,
    },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'API_ERROR', e.message ?? `API request failed (${res.status})`, e.fields);
  }
  return body as T;
}

export interface HomeBundle {
  config: PublicSiteConfig;
  featured: PublicProperty[];
  locations: PublicLocation[];
  projects: PublicProject[];
  agents: PublicAgent[];
  testimonials: PublicTestimonial[];
  articles: PublicArticle[];
  cities: string[];
}

/** True when the website editor's preview iframe is rendering the homepage. */
export const isPreview = cache(async () => (await headers()).get('x-estatery-preview') === 'draft');

/**
 * Draft data for the editor preview. Uses the visitor's own admin session, so only signed-in
 * editors ever receive drafts; for anyone else this returns null and the live site renders.
 */
async function draftFetch<T>(path: string): Promise<T | null> {
  if (!(await isPreview())) return null;
  const jar = await cookies();
  try {
    return await apiFetch<T>(path, { headers: { cookie: jar.getAll().map((c) => `${c.name}=${c.value}`).join('; ') } });
  } catch {
    return null;
  }
}

/** Deduplicated per request: layout and page can both call it without a second round trip. */
export const getSiteConfig = cache(async () => (await draftFetch<PublicSiteConfig>('/v1/admin/site/preview')) ?? apiFetch<PublicSiteConfig>('/v1/site'));
export const getHomeBundle = cache(async () => (await draftFetch<HomeBundle>('/v1/admin/site/preview/home')) ?? apiFetch<HomeBundle>('/v1/site/home'));
export const getCities = cache(async () => (await apiFetch<{ items: string[] }>('/v1/site/cities')).items);

export function searchProperties(query: URLSearchParams) {
  return apiFetch<Paginated<PublicProperty>>(`/v1/properties?${query.toString()}`);
}

export function getProperty(slug: string) {
  return apiFetch<{ property: PublicProperty; similar: PublicProperty[] } | { redirectTo: string }>(`/v1/properties/${encodeURIComponent(slug)}`);
}

/** A content page (About, Contact…). Null when switched off — the route then 404s. Drafts in preview. */
export const getPage = cache(async <K extends PageKey>(key: K): Promise<SitePages[K] | null> => {
  const draft = await draftFetch<SitePages[K]>(`/v1/admin/site/preview/pages/${key}`);
  if (draft) return draft;
  try {
    return await apiFetch<SitePages[K]>(`/v1/site/pages/${key}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
});

export interface ArticleList extends Paginated<PublicArticle> {
  categories: string[];
}
export function getArticles(q: { page?: number; category?: string; limit?: number }) {
  const p = new URLSearchParams();
  if (q.page && q.page > 1) p.set('page', String(q.page));
  if (q.category) p.set('category', q.category);
  if (q.limit) p.set('limit', String(q.limit));
  return apiFetch<ArticleList>(`/v1/site/articles?${p}`);
}

export const getArticle = cache(async (slug: string) => apiFetch<PublicArticleDetail>(`/v1/site/articles/${encodeURIComponent(slug)}`));

export async function getSitemap() {
  return (await apiFetch<{ items: SitemapEntry[] }>('/v1/site/sitemap')).items;
}

/** Absolute site origin for canonical links, sitemaps and structured data. */
export async function siteOrigin() {
  const { canonicalHost } = await getSiteConfig();
  if (canonicalHost) return `https://${canonicalHost}`;
  const host = await visitorHost();
  return `${/^(localhost|127\.|[^.]+\.localhost)(:|$)/.test(host) ? 'http' : 'https'}://${host}`;
}
