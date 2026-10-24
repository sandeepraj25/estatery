import { z } from 'zod';

/**
 * White-label site configuration contracts.
 *
 * The admin panel edits these documents; the API validates them with these exact schemas before
 * saving; the public website renders them. Content is structured data only — never HTML or JS —
 * so a tenant can't inject scripts into their own (or anyone else's) site.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #10251D');
/** Internal paths ("/properties?x=y") or absolute https URLs only. Blocks javascript: and data: URLs. */
export const safeHref = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v.startsWith('/') || /^https:\/\//.test(v) || /^(tel|mailto):/.test(v), {
    message: 'Links must be site paths (/…), https:// URLs, tel: or mailto:',
  });
export const safeImageUrl = z.string().trim().max(500).refine((v) => v.startsWith('/') || /^https:\/\//.test(v), {
  message: 'Images must be https:// URLs or site paths',
});

/** Fonts are chosen from an allowlist that the web app actually bundles. */
export const HEADING_FONTS = ['manrope', 'playfair'] as const;
export const BODY_FONTS = ['inter', 'manrope'] as const;

export const themeTokensSchema = z.object({
  colors: z.object({
    /** Deep brand surface: hero, dark sections, admin sidebar. */
    primary: hex,
    /** Light page surface. */
    background: hex,
    /** Restrained luxury highlight. Use sparingly. */
    accent: hex,
    textOnLight: hex,
    textOnDark: hex,
    mutedOnLight: hex,
    mutedOnDark: hex,
    border: hex,
    success: hex,
    error: hex,
  }),
  typography: z.object({
    heading: z.enum(HEADING_FONTS),
    body: z.enum(BODY_FONTS),
    /** Use the editorial serif for selected large display headlines. */
    editorialHeadlines: z.boolean(),
  }),
  shape: z.object({
    radiusCard: z.number().int().min(0).max(32),
    radiusButton: z.number().int().min(0).max(999),
  }),
  motion: z.object({
    /** "none" disables decorative motion for everyone, independently of prefers-reduced-motion. */
    level: z.enum(['full', 'subtle', 'none']),
  }),
});
export type ThemeTokens = z.infer<typeof themeTokensSchema>;

const cta = z.object({ label: z.string().trim().min(1).max(40), href: safeHref });
const eyebrowTitle = {
  eyebrow: z.string().trim().max(60).default(''),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300).default(''),
};

export const HERO_SCENES = ['pavilion', 'cantilever'] as const;

/** Every homepage section type. Order + visibility live in the page document. */
export const sectionSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string(),
    type: z.literal('hero'),
    enabled: z.boolean(),
    data: z.object({
      eyebrow: z.string().trim().max(60),
      headline: z.string().trim().min(1).max(90),
      /** Word(s) from the headline to render in the editorial accent style. */
      accentWords: z.string().trim().max(40).default(''),
      subheadline: z.string().trim().max(240),
      primaryCta: cta,
      secondaryCta: cta,
      backgroundImage: safeImageUrl,
      scene: z.object({
        enabled: z.boolean(),
        variant: z.enum(HERO_SCENES),
        /** Shown while the 3D scene loads, on low-power devices, and with reduced motion. */
        fallbackImage: safeImageUrl,
      }),
      showFloatingCards: z.boolean(),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('search'),
    enabled: z.boolean(),
    data: z.object({ title: z.string().trim().max(80), popularSearches: z.array(z.object({ label: z.string().max(40), href: safeHref })).max(8) }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('featured'),
    enabled: z.boolean(),
    data: z.object({ ...eyebrowTitle, limit: z.number().int().min(3).max(9), cta }),
  }),
  z.object({ id: z.string(), type: z.literal('locations'), enabled: z.boolean(), data: z.object(eyebrowTitle) }),
  z.object({ id: z.string(), type: z.literal('projects'), enabled: z.boolean(), data: z.object(eyebrowTitle) }),
  z.object({
    id: z.string(),
    type: z.literal('categories'),
    enabled: z.boolean(),
    data: z.object({
      ...eyebrowTitle,
      items: z
        .array(
          z.object({
            label: z.string().max(40),
            description: z.string().max(140),
            href: safeHref,
            image: safeImageUrl,
          }),
        )
        .min(2)
        .max(6),
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('about'),
    enabled: z.boolean(),
    data: z.object({
      ...eyebrowTitle,
      body: z.string().trim().max(900),
      image: safeImageUrl,
      secondaryImage: safeImageUrl,
      metrics: z.array(z.object({ value: z.string().max(12), label: z.string().max(40) })).max(4),
      cta,
    }),
  }),
  z.object({
    id: z.string(),
    type: z.literal('collections'),
    enabled: z.boolean(),
    data: z.object({
      ...eyebrowTitle,
      items: z
        .array(z.object({ title: z.string().max(60), description: z.string().max(160), image: safeImageUrl, href: safeHref }))
        .min(1)
        .max(5),
    }),
  }),
  z.object({ id: z.string(), type: z.literal('agents'), enabled: z.boolean(), data: z.object(eyebrowTitle) }),
  z.object({
    id: z.string(),
    type: z.literal('testimonials'),
    enabled: z.boolean(),
    data: z.object({
      ...eyebrowTitle,
      trust: z.array(z.object({ value: z.string().max(12), label: z.string().max(40) })).max(4),
    }),
  }),
  z.object({ id: z.string(), type: z.literal('insights'), enabled: z.boolean(), data: z.object(eyebrowTitle) }),
  z.object({
    id: z.string(),
    type: z.literal('lead'),
    enabled: z.boolean(),
    data: z.object({ ...eyebrowTitle, body: z.string().max(400), image: safeImageUrl }),
  }),
]);
export type HomeSection = z.infer<typeof sectionSchema>;
export type HomeSectionType = HomeSection['type'];

export const homepageSchema = z.object({
  sections: z
    .array(sectionSchema)
    .min(1)
    .max(20)
    .refine((s) => new Set(s.map((x) => x.id)).size === s.length, 'Section ids must be unique'),
});
export type Homepage = z.infer<typeof homepageSchema>;

export const siteSettingsSchema = z.object({
  businessName: z.string().trim().min(1).max(80),
  tagline: z.string().trim().max(120),
  logoText: z.string().trim().max(40),
  logoUrl: safeImageUrl.nullable(),
  contact: z.object({
    phone: z.string().max(30),
    whatsapp: z.string().max(30),
    email: z.string().email(),
    address: z.string().max(200),
    hours: z.string().max(80),
  }),
  social: z.array(z.object({ network: z.enum(['instagram', 'linkedin', 'youtube', 'facebook', 'x']), href: safeHref })).max(6),
  navigation: z.array(z.object({ label: z.string().max(30), href: safeHref })).max(8),
  footerColumns: z
    .array(z.object({ title: z.string().max(30), links: z.array(z.object({ label: z.string().max(40), href: safeHref })).max(8) }))
    .max(4),
  locale: z.string().max(10),
  currency: z.string().length(3),
  timezone: z.string().max(40),
  seo: z.object({ title: z.string().max(70), description: z.string().max(170), ogImage: safeImageUrl.nullable() }),
  showPlatformBranding: z.boolean(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** Everything the public site needs to render chrome + theme in one request. */
export interface PublicSiteConfig {
  tenant: { id: string; slug: string; name: string };
  /** Main custom domain with working HTTPS, used for canonical URLs. Null = use the visitor's host. */
  canonicalHost?: string | null;
  settings: SiteSettings;
  theme: ThemeTokens;
  homepage: Homepage;
  /** Content pages that are switched on (About, Contact, FAQ, legal). */
  pages?: Record<'about' | 'contact' | 'faq' | 'privacy' | 'terms', boolean>;
}

export interface PublicLocation {
  id: string;
  name: string;
  city: string;
  slug: string;
  image: string;
  propertyCount: number;
  blurb: string;
}

export interface PublicProject {
  id: string;
  name: string;
  slug: string;
  developer: string;
  city: string;
  locality: string;
  status: 'pre-launch' | 'under-construction' | 'ready-to-move';
  possession: string;
  startingPrice: number;
  configurations: string;
  image: string;
  summary: string;
}

export interface PublicAgent {
  id: string;
  name: string;
  title: string;
  photoUrl: string;
  specialities: string[];
  phone: string;
  email: string;
  languages: string[];
  yearsExperience: number;
}

export interface PublicTestimonial {
  id: string;
  quote: string;
  author: string;
  context: string;
  rating: number;
}

export interface PublicArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  image: string;
  readMinutes: number;
  publishedAt: string;
}
