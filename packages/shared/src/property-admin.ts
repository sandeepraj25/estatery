import { z } from 'zod';
import { LISTING_TYPES, PROPERTY_CATEGORIES, PROPERTY_STATUSES, PROPERTY_TYPES } from './property.js';
import { safeImageUrl } from './site.js';

/**
 * Admin-side property contracts: the edit form, the API and CSV import all validate with these.
 */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);

const nullableInt = (max: number) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(0).max(max).nullable());
const nullableCoord = (min: number, max: number) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(min).max(max).nullable());

export const propertyInputSchema = z.object({
  title: z.string().trim().min(5, 'Use at least 5 characters').max(140),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .max(100)
    .regex(/^([a-z0-9]+(-[a-z0-9]+)*)?$/, 'Use lowercase letters, numbers and single hyphens')
    .default(''),
  summary: z.string().trim().max(240).default(''),
  description: z.string().trim().max(8000).default(''),
  listingType: z.enum(LISTING_TYPES),
  category: z.enum(PROPERTY_CATEGORIES),
  type: z.enum(PROPERTY_TYPES),
  price: z.coerce.number({ message: 'Enter a price' }).min(0).max(1e12),
  bhk: nullableInt(20),
  bathrooms: nullableInt(20),
  areaSqft: z.coerce.number({ message: 'Enter the area' }).min(1, 'Enter the area').max(10_000_000),
  location: z.object({
    locality: z.string().trim().min(2, 'Enter the locality').max(80),
    city: z.string().trim().min(2, 'Enter the city').max(60),
    state: z.string().trim().max(60).default(''),
    lat: nullableCoord(-90, 90),
    lng: nullableCoord(-180, 180),
  }),
  amenities: z.array(z.string().trim().min(1).max(40)).max(40).default([]),
  images: z.array(z.object({ url: safeImageUrl, alt: z.string().trim().max(200).default('') })).max(30).default([]),
  featured: z.boolean().default(false),
  verified: z.boolean().default(false),
  agentId: z.string().regex(/^[a-f0-9]{24}$/).nullable().default(null),
  projectId: z.string().regex(/^[a-f0-9]{24}$/).nullable().default(null),
});
export type PropertyInput = z.input<typeof propertyInputSchema>;
export type PropertyInputParsed = z.output<typeof propertyInputSchema>;

export const propertyStatusChangeSchema = z.object({ status: z.enum(PROPERTY_STATUSES) });

/**
 * What must be true before a listing goes live. Drafts may be incomplete; the public site must not be.
 * Returned as plain sentences so the admin UI can show them as a checklist.
 */
export function publishProblems(p: Pick<PropertyInputParsed, 'images' | 'summary' | 'description' | 'price' | 'location'>): string[] {
  const out: string[] = [];
  if (p.images.length === 0) out.push('Add at least one photo');
  if (p.summary.trim().length < 20) out.push('Write a summary of at least 20 characters');
  if (p.description.trim().length < 80) out.push('Write a description of at least 80 characters');
  if (!(p.price > 0)) out.push('Set a price');
  if (!p.location.locality || !p.location.city) out.push('Add the locality and city');
  return out;
}

/** Allowed status changes. Sold/rented only make sense for a listing that was live. */
export const STATUS_TRANSITIONS: Record<(typeof PROPERTY_STATUSES)[number], ReadonlyArray<(typeof PROPERTY_STATUSES)[number]>> = {
  draft: ['published', 'archived'],
  published: ['draft', 'sold', 'rented', 'archived'],
  sold: ['published', 'archived'],
  rented: ['published', 'archived'],
  archived: ['draft'],
};

/** CSV columns, in export order. Import accepts the same header. */
export const PROPERTY_CSV_COLUMNS = [
  'slug', 'title', 'status', 'listingType', 'category', 'type', 'price', 'bhk', 'bathrooms', 'areaSqft',
  'locality', 'city', 'state', 'lat', 'lng', 'amenities', 'images', 'featured', 'verified', 'summary', 'description',
] as const;
