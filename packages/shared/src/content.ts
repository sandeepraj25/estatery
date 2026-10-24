import { z } from 'zod';
import { safeHref, safeImageUrl } from './site.js';

/**
 * Editorial content: the About/Contact/FAQ/legal pages and articles.
 *
 * Long text uses "simple formatting" — plain text with a few conventions — instead of HTML, so
 * nothing an agency writes can inject markup or scripts into the site:
 *
 *   Blank line          → new paragraph
 *   ## Heading          → section heading (### for a smaller one)
 *   - item / 1. item    → bulleted / numbered list
 *   **bold**            → bold
 *   [text](/path)       → link (site paths, https://, mailto: and tel: only)
 */

// ---- Simple formatting -------------------------------------------------------------------------

export type Inline = { t: 'text'; v: string } | { t: 'bold'; v: string } | { t: 'link'; v: string; href: string };
export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h2' | 'h3'; text: string; id: string }
  | { t: 'ul' | 'ol'; items: Inline[][] };

const LINK_OK = /^(\/(?!\/)|https:\/\/|mailto:|tel:)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]{1,200})\]\(([^)\s]{1,300})\)/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ t: 'text', v: text.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ t: 'bold', v: m[1] });
    else if (LINK_OK.test(m[3]!)) out.push({ t: 'link', v: m[2]!, href: m[3]! });
    else out.push({ t: 'text', v: m[2]! }); // unsafe link target: keep the words, drop the link
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

export const slugifyHeading = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'section';

export function parseRichText(src: string): Block[] {
  const blocks: Block[] = [];
  const used = new Map<string, number>();
  for (const chunk of src.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    const first = lines[0]!.trim();
    const heading = /^(#{2,3})\s+(.+)$/.exec(first);
    if (heading && lines.length === 1) {
      const text = heading[2]!.trim();
      let id = slugifyHeading(text);
      const n = used.get(id) ?? 0;
      used.set(id, n + 1);
      if (n) id = `${id}-${n + 1}`;
      blocks.push({ t: heading[1]!.length === 2 ? 'h2' : 'h3', text, id });
      continue;
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      blocks.push({ t: 'ul', items: lines.map((l) => parseInline(l.replace(/^\s*[-*]\s+/, ''))) });
      continue;
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      blocks.push({ t: 'ol', items: lines.map((l) => parseInline(l.replace(/^\s*\d+[.)]\s+/, ''))) });
      continue;
    }
    blocks.push({ t: 'p', c: parseInline(lines.map((l) => l.trim()).join(' ')) });
  }
  return blocks;
}

export function plainText(src: string) {
  return src.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^#{2,3}\s+/gm, '').replace(/^\s*([-*]|\d+[.)])\s+/gm, '');
}

export const readingMinutes = (src: string) => Math.max(1, Math.round(plainText(src).split(/\s+/).filter(Boolean).length / 200));

/** Text using simple formatting; rejects unsafe link targets with a clear message. */
export const richText = (max: number) =>
  z.string().max(max).superRefine((v, ctx) => {
    for (const m of v.matchAll(/\[([^\]]{1,200})\]\(([^)\s]{1,300})\)/g)) {
      if (!LINK_OK.test(m[2]!)) ctx.addIssue({ code: 'custom', message: `The link “${m[1]}” must start with /, https://, mailto: or tel:` });
    }
  });

// ---- Site pages --------------------------------------------------------------------------------

export const PAGE_KEYS = ['about', 'contact', 'faq', 'privacy', 'terms'] as const;
export type PageKey = (typeof PAGE_KEYS)[number];
export const PAGE_PATHS: Record<PageKey, string> = { about: '/about', contact: '/contact', faq: '/faq', privacy: '/privacy', terms: '/terms' };
export const PAGE_LABELS: Record<PageKey, string> = { about: 'About', contact: 'Contact', faq: 'FAQ', privacy: 'Privacy policy', terms: 'Terms of use' };

const pageBase = {
  enabled: z.boolean(),
  title: z.string().trim().min(1, 'Add a page title').max(80),
  intro: z.string().trim().max(400),
  seoDescription: z.string().trim().max(170),
};

export const sitePagesSchema = z.object({
  about: z.object({
    ...pageBase,
    image: z.union([safeImageUrl, z.literal('')]),
    body: richText(20_000),
    highlights: z.array(z.object({ value: z.string().trim().min(1).max(20), label: z.string().trim().min(1).max(60) })).max(4),
    showAdvisors: z.boolean(),
    showTestimonials: z.boolean(),
  }),
  contact: z.object({
    ...pageBase,
    showForm: z.boolean(),
    /** Extra notes beside the contact details, e.g. directions or parking. */
    body: richText(4_000),
    mapUrl: z.union([z.literal(''), z.string().trim().max(500).refine((v) => /^https:\/\/(www\.)?(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)\//.test(v), 'Paste a Google Maps link (https://maps.app.goo.gl/… or https://www.google.com/maps/…)')]),
  }),
  faq: z.object({
    ...pageBase,
    items: z.array(z.object({ question: z.string().trim().min(3).max(200), answer: richText(2_000).refine((v) => v.trim().length > 0, 'Add an answer') })).max(40),
  }),
  privacy: z.object({ ...pageBase, body: richText(40_000), lastUpdated: z.string().date() }),
  terms: z.object({ ...pageBase, body: richText(40_000), lastUpdated: z.string().date() }),
});
export type SitePages = z.infer<typeof sitePagesSchema>;
export type SitePage<K extends PageKey> = SitePages[K];

/** Which pages are switched on (sent with the site config for menus and footers). */
export type EnabledPages = Record<PageKey, boolean>;

// ---- Articles ----------------------------------------------------------------------------------

export const ARTICLE_STATUSES = ['draft', 'published'] as const;
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export const articleInputSchema = z.object({
  title: z.string().trim().min(3, 'Add a headline').max(140),
  slug: z.union([z.literal(''), z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens').min(3).max(120)]),
  excerpt: z.string().trim().max(300),
  category: z.string().trim().min(1, 'Choose or type a category').max(40),
  /** Optional while drafting; publishing requires it. */
  image: z.union([safeImageUrl, z.literal('')]),
  imageAlt: z.string().trim().max(160),
  body: richText(60_000),
  authorId: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  seoTitle: z.string().trim().max(70),
  seoDescription: z.string().trim().max(170),
});
export type ArticleInput = z.infer<typeof articleInputSchema>;

/** Publishing requires a complete article (drafts can be saved half-written). */
export function articlePublishProblems(a: Pick<ArticleInput, 'title' | 'excerpt' | 'body' | 'image'>) {
  const problems: string[] = [];
  if (a.excerpt.trim().length < 40) problems.push('Write a summary of at least 40 characters');
  if (plainText(a.body).trim().split(/\s+/).length < 80) problems.push('Write at least 80 words');
  if (!a.image) problems.push('Choose a cover image');
  return problems;
}

export interface PublicArticleDetail {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
  category: string;
  image: string;
  imageAlt: string;
  readMinutes: number;
  publishedAt: string;
  updatedAt: string;
  seoTitle: string;
  seoDescription: string;
  author: { name: string; title: string; photoUrl: string } | null;
  related: Array<{ title: string; slug: string; image: string; category: string; publishedAt: string; readMinutes: number }>;
}

export interface SitemapEntry {
  path: string;
  lastModified: string;
  priority: number;
}

// ---- Redirects -----------------------------------------------------------------------------------

/** Paths the platform owns; an agency can't redirect them away. */
const RESERVED_PATHS = ['/', '/properties', '/insights', '/about', '/contact', '/faq', '/privacy', '/terms', '/sitemap.xml', '/robots.txt', '/icon.svg', '/favicon.ico'];
const RESERVED_PREFIXES = ['/admin', '/api', '/_next', '/media'];

/** Lower-case, no trailing slash, no query string: how incoming paths are matched. */
export function normalizeRedirectPath(p: string) {
  let s = p.trim().split(/[?#]/)[0]!.toLowerCase();
  try {
    s = decodeURI(s);
  } catch {
    /* keep as typed */
  }
  if (s.length > 1) s = s.replace(/\/+$/, '');
  return s;
}

export const redirectInputSchema = z.object({
  from: z.string().trim().max(300).transform(normalizeRedirectPath).superRefine((v, ctx) => {
    if (!v.startsWith('/') || v.startsWith('//')) ctx.addIssue({ code: 'custom', message: 'Start the old address with / (e.g. /old-page.html)' });
    else if (RESERVED_PATHS.includes(v) || RESERVED_PREFIXES.some((p) => v === p || v.startsWith(`${p}/`))) ctx.addIssue({ code: 'custom', message: `${v} is a page of this website and can’t be redirected` });
  }),
  to: safeHref,
  permanent: z.boolean().default(true),
});
export type RedirectInput = z.input<typeof redirectInputSchema>;

export interface RedirectRule {
  from: string;
  to: string;
  permanent: boolean;
}

// ---- Agencies (platform operator) ---------------------------------------------------------------

const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'app', 'sites', 'mail', 'static', 'cdn', 'status', 'help', 'support', 'billing', 'platform'];

export const createAgencySchema = z.object({
  name: z.string().trim().min(2, 'Enter the agency’s name').max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'Use 2–40 lowercase letters, numbers and hyphens')
    .refine((s) => s.length >= 2 && !RESERVED_SUBDOMAINS.includes(s), 'This address is reserved'),
  ownerName: z.string().trim().min(2, 'Enter the owner’s name').max(80),
  ownerEmail: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  themePreset: z.string().trim().max(40),
});
export type CreateAgencyInput = z.infer<typeof createAgencySchema>;
